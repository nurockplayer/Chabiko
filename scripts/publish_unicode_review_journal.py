#!/usr/bin/env python3
"""Publish a validated journal staging directory with atomic no-replace semantics."""

from __future__ import annotations

import ctypes
import errno
import json
import os
import platform
import stat
import subprocess
import sys
import tempfile
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

MARKER_NAME = ".unicode-review-journal.json"
EVENTS_NAME = "events"
PROTOCOL = "unicode-review-journal-v1"
RENAME_NOREPLACE = 1
RENAME_EXCL = 0x00000004
DESTINATION_EXISTS_EXIT = 73


class DestinationExists(Exception):
    """The exclusive destination already exists."""


def _identity_matches(actual: os.stat_result, expected: dict[str, Any], label: str) -> None:
    if (actual.st_dev, actual.st_ino) != (expected.get("device"), expected.get("inode")):
        raise RuntimeError(f"{label} identity changed before publication")


def _read_exact(fd: int, expected: bytes) -> None:
    chunks: list[bytes] = []
    while True:
        chunk = os.read(fd, 4096)
        if not chunk:
            break
        chunks.append(chunk)
    if b"".join(chunks) != expected:
        raise RuntimeError("staging protocol marker has unexpected content")


def _verify_tree(parent_fd: int, source_name: str, expected: dict[str, Any]) -> int:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    stage_fd = os.open(source_name, flags, dir_fd=parent_fd)
    try:
        stage_stat = os.fstat(stage_fd)
        if not stat.S_ISDIR(stage_stat.st_mode):
            raise RuntimeError("staging root is not a directory")
        _identity_matches(stage_stat, expected["root"], "staging root")
        if set(os.listdir(stage_fd)) != {MARKER_NAME, EVENTS_NAME}:
            raise RuntimeError("staging root inventory changed before publication")

        marker_flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        marker_fd = os.open(MARKER_NAME, marker_flags, dir_fd=stage_fd)
        try:
            marker_stat = os.fstat(marker_fd)
            if not stat.S_ISREG(marker_stat.st_mode) or marker_stat.st_nlink != 1:
                raise RuntimeError("staging protocol marker is not a singly linked regular file")
            _identity_matches(marker_stat, expected["marker"], "staging protocol marker")
            _read_exact(marker_fd, f'{{"protocolVersion":"{PROTOCOL}"}}\n'.encode())
        finally:
            os.close(marker_fd)

        events_fd = os.open(EVENTS_NAME, flags, dir_fd=stage_fd)
        try:
            events_stat = os.fstat(events_fd)
            if not stat.S_ISDIR(events_stat.st_mode) or os.listdir(events_fd):
                raise RuntimeError("staging events directory is not empty")
            _identity_matches(events_stat, expected["events"], "staging events directory")
        finally:
            os.close(events_fd)
        return stage_fd
    except BaseException:
        os.close(stage_fd)
        raise


def _rename_exclusive(
    parent_fd: int,
    source_path: str,
    destination_path: str,
    source_name: str,
    destination_name: str,
    platform_name: str | None = None,
) -> None:
    current_platform = platform_name or platform.system()
    libc = ctypes.CDLL(None, use_errno=True)
    if current_platform == "Linux":
        operation = getattr(libc, "renameat2", None)
        if operation is None:
            raise RuntimeError("Linux runtime does not expose renameat2; exclusive journal publication is unsupported")
        operation.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        operation.restype = ctypes.c_int
        result = operation(parent_fd, os.fsencode(source_name), parent_fd, os.fsencode(destination_name), RENAME_NOREPLACE)
    elif current_platform == "Darwin":
        operation = getattr(libc, "renamex_np", None)
        if operation is None:
            raise RuntimeError("Darwin runtime does not expose renamex_np; exclusive journal publication is unsupported")
        operation.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        operation.restype = ctypes.c_int
        result = operation(os.fsencode(source_path), os.fsencode(destination_path), RENAME_EXCL)
    else:
        raise RuntimeError(f"exclusive journal publication is unsupported on {current_platform}")

    if result == 0:
        return
    error_number = ctypes.get_errno()
    if error_number == errno.EEXIST:
        raise DestinationExists
    raise OSError(error_number, os.strerror(error_number), destination_path)


def publish(
    source_path: str,
    destination_path: str,
    expected: dict[str, Any],
    *,
    platform_name: str | None = None,
    after_rename: Callable[[], None] | None = None,
) -> None:
    source = Path(source_path)
    destination = Path(destination_path)
    if source.parent != destination.parent or source.name == destination.name:
        raise RuntimeError("staging and canonical journal must be distinct siblings")

    parent_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    parent_fd = os.open(source.parent, parent_flags)
    stage_fd: int | None = None
    try:
        if not stat.S_ISDIR(os.fstat(parent_fd).st_mode):
            raise RuntimeError("journal parent is not a directory")
        stage_fd = _verify_tree(parent_fd, source.name, expected)
        try:
            os.stat(destination.name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise DestinationExists

        # Recheck immediately before the no-replace syscall while retaining the
        # validated staging descriptor across the publication boundary.
        os.close(stage_fd)
        stage_fd = _verify_tree(parent_fd, source.name, expected)
        _rename_exclusive(parent_fd, str(source), str(destination), source.name, destination.name, platform_name)
        after_rename and after_rename()
        published = os.stat(destination.name, dir_fd=parent_fd, follow_symlinks=False)
        _identity_matches(published, expected["root"], "published journal root")
    finally:
        if stage_fd is not None:
            os.close(stage_fd)
        os.close(parent_fd)


def _make_stage(parent: str, suffix: str) -> tuple[str, dict[str, Any]]:
    stage = tempfile.mkdtemp(prefix=f".unicode-journal-{suffix}-", dir=parent)
    marker_path = os.path.join(stage, MARKER_NAME)
    events_path = os.path.join(stage, EVENTS_NAME)
    marker_fd = os.open(marker_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(marker_fd, f'{{"protocolVersion":"{PROTOCOL}"}}\n'.encode())
        os.fsync(marker_fd)
    finally:
        os.close(marker_fd)
    os.mkdir(events_path, 0o700)
    for path in (events_path, stage, parent):
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    return stage, {
        "root": _stat_identity(stage),
        "marker": _stat_identity(marker_path),
        "events": _stat_identity(events_path),
    }


def _stat_identity(path: str) -> dict[str, int]:
    result = os.lstat(path)
    return {"device": result.st_dev, "inode": result.st_ino}


def _self_test() -> None:
    with tempfile.TemporaryDirectory(prefix="unicode-journal-publish-test-") as parent:
        source, expected = _make_stage(parent, "single")
        destination = os.path.join(parent, "journal")
        publish(source, destination, expected)
        if os.path.lexists(source) or not os.path.isdir(destination):
            raise AssertionError("successful publication did not atomically move the staging root")

        losing_source, losing_expected = _make_stage(parent, "loser")
        try:
            publish(losing_source, destination, losing_expected)
        except DestinationExists:
            pass
        else:
            raise AssertionError("exclusive publication replaced an existing destination")
        if not os.path.isdir(losing_source) or not os.path.isdir(destination):
            raise AssertionError("no-replace failure did not preserve source and destination")

        try:
            _rename_exclusive(-1, "source", "destination", "source", "destination", "UnsupportedOS")
        except RuntimeError as error:
            if "unsupported" not in str(error).lower():
                raise
        else:
            raise AssertionError("unsupported platforms did not fail closed")

    with tempfile.TemporaryDirectory(prefix="unicode-journal-publish-race-") as parent:
        candidates = [_make_stage(parent, f"race-{index}") for index in range(2)]
        destination = os.path.join(parent, "journal")
        barrier = threading.Barrier(2)
        outcomes: list[str] = []

        def contender(candidate: tuple[str, dict[str, Any]]) -> None:
            source, expected = candidate
            barrier.wait()
            try:
                publish(source, destination, expected)
                outcomes.append("published")
            except DestinationExists:
                outcomes.append("exists")

        threads = [threading.Thread(target=contender, args=(candidate,)) for candidate in candidates]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        if sorted(outcomes) != ["exists", "published"] or not os.path.isdir(destination):
            raise AssertionError("concurrent publication did not produce exactly one winner")

    with tempfile.TemporaryDirectory(prefix="unicode-journal-publish-crash-") as parent:
        source, expected = _make_stage(parent, "crash")
        destination = os.path.join(parent, "journal")
        module_path = os.path.realpath(__file__)
        code = (
            "import importlib.util, os, sys; "
            "spec=importlib.util.spec_from_file_location('journal_publish', sys.argv[1]); "
            "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); "
            "module.publish(sys.argv[2], sys.argv[3], module.json.loads(sys.argv[4]), "
            "after_rename=lambda: os._exit(86))"
        )
        result = subprocess.run(
            [sys.executable, "-c", code, module_path, source, destination, json.dumps(expected)],
            check=False,
        )
        if result.returncode != 86 or os.path.lexists(source) or not os.path.isdir(destination):
            raise AssertionError("helper crash after native publication did not preserve the canonical root")


def main(arguments: list[str]) -> int:
    if arguments == ["--self-test"]:
        _self_test()
        print("exclusive journal publication helper: PASS")
        return 0
    if len(arguments) != 3:
        print("usage: publish_unicode_review_journal.py STAGING_ROOT CANONICAL_ROOT EXPECTED_IDENTITIES_JSON", file=sys.stderr)
        return 2
    source, destination, expected_raw = arguments
    try:
        expected = json.loads(expected_raw)
        if not isinstance(expected, dict) or set(expected) != {"root", "marker", "events"}:
            raise ValueError("expected identity inventory has an unsupported schema")
        publish(source, destination, expected)
        return 0
    except DestinationExists:
        print("DESTINATION_EXISTS: canonical journal root already exists", file=sys.stderr)
        return DESTINATION_EXISTS_EXIT
    except Exception as error:  # Fail closed and leave any published canonical root untouched.
        print(f"exclusive journal publication failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
