"""Prepare/check #484 review documents without changing production artifacts."""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.teacher_phrase_sidecar import (  # noqa: E402 - direct CLI execution requires repository path bootstrap
    ContractError,
    build_sidecar,
    validate_sidecar,
    serialize_sidecar,
    sha256_bytes,
)
from scripts.teacher_phrase_promotion import (  # noqa: E402 - direct CLI execution requires repository path bootstrap
    REQUIRED_REVIEW_ROLES,
    compute_review_version,
    sidecar_sha256,
    build_promoted_projection,
)

DIRECTORY = ROOT / "docs/content/teacher-phrase-pilot-484"
SHEETS = ("名词1", "动词1", "形容词1", "名词2", "形容词2", "动词2")
FIELDS = ("traditional", "pinyin", "japanese")
RIGHTS = "docs/content/teacher-phrase-pilot-484/provenance.md#generated-rights-pending"
INPUTS = (
    "selection.json",
    "candidates.json",
    "provenance.md",
    "review-instructions.md",
)


def require(condition, message):
    if not condition:
        raise ContractError(message)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def select_records(sidecar, manifest):
    """Select in manifest order; only the amended no-LF sheet is exceptional."""
    by_id = {r["learnerId"]: r for r in sidecar["records"]}
    require(len(by_id) == len(sidecar["records"]), "duplicate source learner IDs")
    selected = []
    counts = dict.fromkeys(SHEETS, 0)
    for row in manifest["rows"]:
        record = by_id.get(row["learnerId"])
        if record is None:
            continue
        source = record["source"]
        sheet = source["sheet"]
        if sheet not in counts or counts[sheet] == 2:
            continue
        qualifies = source["segmentation"] == "raw-lf"
        if sheet == "名词2":
            qualifies = (
                source["segmentation"] == "review-required"
                and source.get("segmentationReason") == "no-raw-lf"
                and len(record["teacherPhrases"]) == 1
            )
        if qualifies and not any(
            "duplicateDiscriminator" in p for p in record["teacherPhrases"]
        ):
            selected.append(copy.deepcopy(record))
            counts[sheet] += 1
    require(all(n == 2 for n in counts.values()), f"insufficient pilot cells: {counts}")
    return selected


def validate_overlay(selected, candidates):
    require(
        [r["learnerId"] for r in candidates] == [r["learnerId"] for r in selected],
        "candidate selection/order drift",
    )
    for original, candidate in zip(selected, candidates, strict=True):
        stripped = copy.deepcopy(candidate)
        for phrase in stripped["teacherPhrases"]:
            for field in FIELDS:
                require(
                    isinstance(phrase.get(field), str) and phrase[field].strip(),
                    "missing candidate field",
                )
                require(
                    phrase["fieldProvenance"].get(field)
                    == {
                        "provenance": "generated",
                        "sourceRef": f"codex-draft:issue-484:v1:{phrase['phraseId']}:{field}",
                        "rightsRef": RIGHTS,
                    },
                    "draft provenance drift",
                )
                del phrase[field]
                del phrase["fieldProvenance"][field]
        require(stripped == original, "frozen source/identity drift")


def apply_candidates(sidecar, manifest, candidates):
    selected = select_records(sidecar, manifest)
    validate_overlay(selected, candidates)
    overlays = {r["learnerId"]: r for r in candidates}
    result = copy.deepcopy(sidecar)
    result["records"] = [
        copy.deepcopy(overlays.get(r["learnerId"], r)) for r in sidecar["records"]
    ]
    return result


def pending_review(sidecar, candidates):
    records = []
    for record in candidates:
        roles = []
        for role in REQUIRED_REVIEW_ROLES:
            evidence = dict(
                role=role,
                outcome="not-reviewed",
                reviewerIdentity=None,
                reviewDate=None,
                reviewVersion=None,
                reviewedPhraseIds=[],
                findings=None,
            )
            if role == "human-source-reviewer":
                evidence["sourceRevision"] = None
            roles.append(evidence)
        records.append(
            dict(
                learnerId=record["learnerId"],
                sourceRevision=record["source"]["sourceRevision"],
                reviewVersion=compute_review_version(record),
                orderedPhraseIds=[p["phraseId"] for p in record["teacherPhrases"]],
                roleEvidence=roles,
                overallDecision=None,
                maintainerPromotion=None,
            )
        )
    return dict(
        schemaVersion=1,
        contractId="teacher-phrase-human-review-v1",
        base=dict(
            sidecarContractId=sidecar["contractId"],
            sidecarSha256=sidecar_sha256(sidecar),
            **sidecar["base"],
        ),
        records=records,
    )


def packet(candidates, review):
    lines = [
        "# Pilot #484: frozen candidate review packet",
        "",
        "**HUMAN_GATE — AI drafts; no human approval or promotion.**",
        "",
        "Read [review instructions](review-instructions.md) and [per-field provenance](provenance.md).",
        "Exact machine evidence: [selection](selection.json), [candidates](candidates.json), "
        "[pending #479 artifact](human-review.json), [hash freeze](freeze.json).",
        "",
        "24 source units / 72 generated fields / 12 cells. Canonical source order is preserved.",
        "",
    ]
    for record, evidence in zip(candidates, review["records"], strict=True):
        source = record["source"]
        lines += [
            f"## {source['sheet']}:{source['row']} — `{record['learnerId']}`",
            "",
            f"- sourceRevision: `{source['sourceRevision']}`",
            f"- rawCellSha256: `{source['rawCellSha256']}`",
            f"- reviewVersion: `{evidence['reviewVersion']}`",
            f"- segmentation: `{source['segmentation']}` / `{source.get('segmentationReason', 'not applicable')}`",
            "",
            "Exact raw cell (JSON-escaped; `\\n` is a source LF):",
            "",
            "```json",
            json.dumps(source["rawCell"], ensure_ascii=False),
            "```",
            "",
        ]
        if source["sheet"] == "名词2":
            lines += [
                "**Required human whole-cell decision:** accept whole cell as one learner phrase unit **or** "
                "reject the cell as unsuitable for promotion under the current contract. "
                "Record the answer in human-teaching-reviewer findings with the exact version. "
                "If internal segmentation is needed, reject and record follow-up evidence only; do not split or substitute.",
                "",
            ]
        lines += [
            "| Unit / exact phraseId | Teacher Simplified | Candidate Traditional | Candidate pinyin | Candidate Japanese |",
            "|---|---|---|---|---|",
        ]
        for index, p in enumerate(record["teacherPhrases"], 1):
            cells = [
                f"{index}: `{p['phraseId']}`",
                p["simplified"],
                p["traditional"],
                p["pinyin"],
                p["japanese"],
            ]
            lines.append(
                "| "
                + " | ".join(v.replace("|", "\\|").replace("\n", "<br>") for v in cells)
                + " |"
            )
        lines += [
            "",
            "Human role outcomes, corrections, suitability, minutes spent, and packet-clarity feedback: **pending**.",
            "",
        ]
    return ("\n".join(lines).rstrip("\n") + "\n").encode()


def freeze_payload(directory, selection, review, packet_bytes):
    return dict(
        contractId="teacher-phrase-pilot-freeze-v1",
        sourceOnlySidecarSha256=selection["sourceOnlySidecarSha256"],
        candidateSidecarSha256=review["base"]["sidecarSha256"],
        files={
            **{name: sha256_bytes((directory / name).read_bytes()) for name in INPUTS},
            "human-review.json": sha256_bytes(serialize_sidecar(review)),
            "reviewer-packet.md": sha256_bytes(packet_bytes),
        },
        reviewVersions={r["learnerId"]: r["reviewVersion"] for r in review["records"]},
    )


def prepare(directory, workbook=None):
    selection = read_json(directory / "selection.json")
    candidate_doc = read_json(directory / "candidates.json")
    require(
        candidate_doc.get("contractId") == "teacher-phrase-pilot-candidates-v1",
        "invalid candidate contract",
    )
    candidates = candidate_doc["records"]
    validate_overlay(selection["records"], candidates)
    enriched = None
    if workbook:
        manifest = read_json(
            ROOT / "data/teacher-vocabulary-preview/learner-manifest.json"
        )
        source = build_sidecar(manifest, workbook)
        validate_sidecar(source, manifest, workbook)
        require(source["base"] == selection["base"], "source base drift")
        require(
            sidecar_sha256(source) == selection["sourceOnlySidecarSha256"],
            "source-only sidecar drift",
        )
        require(
            select_records(source, manifest) == selection["records"],
            "deterministic selection drift",
        )
        enriched = apply_candidates(source, manifest, candidates)
        validate_sidecar(enriched, manifest, workbook)
        review = pending_review(enriched, candidates)
        require(
            build_promoted_projection(manifest, enriched, review, workbook)["records"]
            == [],
            "draft promotion leak",
        )
    else:
        review = read_json(directory / "human-review.json")
        placeholder = dict(
            contractId="teacher-phrase-authoring-v1", base=selection["base"], records=[]
        )
        expected = pending_review(placeholder, candidates)
        expected["base"]["sidecarSha256"] = read_json(directory / "freeze.json")[
            "candidateSidecarSha256"
        ]
        require(review == expected, "pending review artifact drift")
    packet_bytes = packet(candidates, review)
    frozen = freeze_payload(directory, selection, review, packet_bytes)
    return enriched, {
        "human-review.json": serialize_sidecar(review),
        "reviewer-packet.md": packet_bytes,
        "freeze.json": serialize_sidecar(frozen),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--freeze", action="store_true")
    parser.add_argument("--workbook", type=Path)
    parser.add_argument("--directory", type=Path, default=DIRECTORY)
    parser.add_argument("--materialize-sidecar", type=Path)
    args = parser.parse_args()
    try:
        require(
            not args.freeze or args.workbook is not None,
            "--freeze requires canonical workbook",
        )
        require(
            not args.materialize_sidecar or (args.check and args.workbook),
            "materialization requires --check and workbook",
        )
        enriched, outputs = prepare(args.directory, args.workbook)
        if args.freeze:
            require(
                all(not (args.directory / name).exists() for name in outputs),
                "freeze refuses existing review artifacts",
            )
            for name, data in outputs.items():
                with (args.directory / name).open("xb") as handle:
                    handle.write(data)
        else:
            for name, data in outputs.items():
                require(
                    (args.directory / name).read_bytes() == data,
                    f"frozen artifact drift: {name}",
                )
        if args.materialize_sidecar:
            output = args.materialize_sidecar.resolve()
            require(
                not output.is_relative_to(ROOT),
                "materialize outside the repository only",
            )
            with output.open("xb") as handle:
                handle.write(serialize_sidecar(enriched))
        print(
            "PASS: pilot freeze; "
            + (
                "canonical workbook selection and draft rejection"
                if args.workbook
                else "offline hashes/versions only; workbook selection not revalidated"
            )
        )
        return 0
    except (ContractError, OSError, ValueError, KeyError, TypeError) as error:
        print(f"Pilot validation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
