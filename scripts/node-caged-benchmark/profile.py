#!/usr/bin/env python3
"""Sample a command in a fresh cgroup, or instrument its Playwright sibling."""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time

CGROUP = Path("/sys/fs/cgroup")
MIB = 1024**2


def counters(name):
    return dict((key, int(value)) for key, value in
                (line.split() for line in (CGROUP / name).read_text().splitlines()))


def process_sample(root):
    processes = {}
    for proc in Path("/proc").iterdir():
        if not proc.name.isdecimal():
            continue
        try:
            stat = (proc / "stat").read_text()
            fields = stat.rsplit(")", 1)[1].split()
            command = (proc / "cmdline").read_bytes().decode(errors="replace").replace("\0", " ")
        except (FileNotFoundError, ProcessLookupError):
            continue
        processes[int(proc.name)] = (int(fields[1]), int(fields[21]), command)

    peaks = dict(tree=0, node=0, browser=0, audio=0, native=0, vitest_forks=0)
    for pid, (_, pages, command) in processes.items():
        ancestor = pid
        while ancestor != root and ancestor in processes:
            ancestor = processes[ancestor][0]
        if ancestor != root:
            continue
        rss = pages * os.sysconf("SC_PAGE_SIZE")
        executable = command.split(" ", 1)[0].rsplit("/", 1)[-1]
        role = "native"
        if executable.startswith(("chrome", "chromium", "firefox", "WebKit")):
            role = "browser"
        elif executable in ("ffmpeg", "ffprobe") or (
            executable == "node" and re.search(r"scripts/audio/(generate|compare-voices)\.ts", command)
        ):
            role = "audio"
        elif executable == "node" or "node_modules/.bin/" in command:
            role = "node"
        peaks["tree"] += rss
        peaks[role] += rss
        peaks["vitest_forks"] += int("tinypool/dist/entry/process" in command)
    return peaks


def profile(label, command):
    out = Path("/bench/results")
    heap_path = out / f"{label}.jsonl"
    env = dict(os.environ, BENCH_HEAP=str(heap_path),
               NODE_OPTIONS=os.environ.get("NODE_OPTIONS", "") + " --require=/bench/heap.cjs")
    start_cpu = counters("cpu.stat")
    started = time.monotonic()
    child = subprocess.Popen(command, env=env)
    peak = {}
    while True:
        for key, value in process_sample(child.pid).items():
            peak[key] = max(peak.get(key, 0), value)
        if child.poll() is not None:
            break
        time.sleep(.05)
    cpu = counters("cpu.stat")
    heap = [json.loads(line) for line in heap_path.read_text().splitlines()] if heap_path.exists() else []
    record = dict(
        label=label, status=child.returncode, seconds=time.monotonic() - started,
        cpu_seconds=(cpu["usage_usec"] - start_cpu["usage_usec"]) / 1e6,
        container=int((CGROUP / "memory.peak").read_text()),
        oom=counters("memory.events")["oom_kill"], **peak,
        **{key: max((item[key] for item in heap), default=None)
           for key in ("heapUsed", "heapTotal", "external")},
        gc_count=sum(item["gcCount"] for item in heap),
        gc_ms=sum(item["gcMs"] for item in heap),
        worker_isolates=sum(item["threadId"] != 0 for item in heap),
        isolates=len(heap),
    )
    (out / f"{label}.json").write_text(json.dumps(record) + "\n")
    return child.returncode if child.returncode >= 0 else 128 - child.returncode


def browser(args):
    # Keep the repo's exact Playwright command, config, browser and snapshot
    # mode. Substitute only disposable resources, limits and Node binary.
    label = os.environ["BENCH_LABEL"]
    bench = os.environ["BENCH_DIR"]
    run_id = os.environ["BENCH_ID"]
    runtime = os.environ["BENCH_VARIANT"]
    script = args[-1]
    first, playback = script.split("corepack pnpm exec playwright", 1)
    suite = "visual" if "playwright.visual.config.ts" in playback else "a11y"
    store = f"{run_id}-{runtime}-{suite}"
    cli = "/bench/docker"
    subprocess.run([cli, "volume", "create", "--label", f"chabiko.bench={run_id}", store],
                   check=True, stdout=subprocess.DEVNULL)
    common_git = next(arg for arg in args if ",target=" in arg and "/.git" in arg)
    # The benchmark checkout has its own .git directory within /work.
    mount_index = args.index(common_git)
    del args[mount_index - 1:mount_index + 1]
    for i, arg in enumerate(args):
        if arg.startswith("type=volume,source="):
            args[i] = f"type=volume,source={store},target=/pnpm/store"
    image_index = args.index(next(arg for arg in args if arg.startswith("mcr.microsoft.com/playwright@")))
    args[image_index] = os.environ["BENCH_BROWSER_IMAGE"]
    args[1:1] = ["--cpus", "3", "--memory", "4g", "--memory-swap", "4g",
                 "--label", f"chabiko.bench={run_id}",
                 "--mount", f"type=bind,source={bench},target=/bench"]
    args[-1] = (
        f"export PATH=/bench/{runtime}:$PATH\n"
        f"{first}"
        'node -p \'JSON.stringify({node:process.version, arch:process.arch, '
        'compression:process.config.variables.v8_enable_pointer_compression})\'\n'
        f"exec python3 /bench/profile.py {label}-{suite} bash -ec "
        + shlex.quote("corepack pnpm exec playwright" + playback)
    )
    os.execv(cli, [cli, *args])


def summary(scratch):
    output = scratch / "results"
    print("RESULT columns: label exit elapsed_s CPU_s container_MiB tree_MiB node_MiB browser_MiB "
          "audio_MiB native_MiB heapUsed_MiB heapTotal_MiB external_MiB "
          "GC_count GC_ms forks worker_isolates isolates oom_kills", flush=True)
    for path in sorted(output.glob("*.json")):
        row = json.loads(path.read_text())
        size = lambda key: "-" if row[key] is None else f"{row[key] / MIB:.1f}"
        print(row["label"], row["status"], f"{row['seconds']:.2f}", f"{row['cpu_seconds']:.2f}",
              *(size(key) for key in ("container", "tree", "node", "browser", "audio", "native",
                                       "heapUsed", "heapTotal", "external")),
              row["gc_count"], round(row["gc_ms"], 1), row["vitest_forks"],
              row["worker_isolates"], row["isolates"], row["oom"], flush=True)
    seen = set()
    for log in sorted(scratch.glob("*-[123]-*.log")):
        lines = log.read_text(errors="replace").replace("\r", "\n").splitlines()
        signals = [line.strip() for line in lines if re.search(
            r"\[FAIL\]|\bError:|\bfailed\b|\bpassed\b|not found|ERR_|SNAPSHOT|SIG[A-Z]+", line
        )]
        # Playwright's line reporter uses terminal control sequences.
        signals = [re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", line) for line in signals]
        key = (log.name.split("-")[0], log.name.split("-", 2)[2], tuple(signals[-16:]))
        if signals and key not in seen:
            print(f"OUTCOME {log.stem}", *signals[-16:], sep="\n")
            seen.add(key)


if __name__ == "__main__":
    if Path(sys.argv[0]).name == "docker":
        browser(sys.argv[1:])
    elif sys.argv[1] == "summary":
        summary(Path(sys.argv[2]))
    else:
        sys.exit(profile(sys.argv[1], sys.argv[2:]))
