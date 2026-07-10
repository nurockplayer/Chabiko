# Chabiko | チャビコ

Chabiko is a website for Japanese speakers learning Mandarin Chinese for Taiwan travel.
The goal is to take a complete beginner from "I know kanji, but not Mandarin" to practical
phrases, recognition, and confidence for a trip to Taiwan.

## Product Direction

- Fun, short lessons that are easy to continue reading.
- Traditional Chinese first, because the travel target is Taiwan.
- Japanese explanations, kana support, pinyin, and natural Japanese comparisons.
- A dedicated collection of Mandarin words whose written form and Japanese on-yomi feel close.
- Travel-first scenarios: airport, transport, convenience stores, restaurants, hotels, and emergencies.
- Curated links to outside resources without copying third-party copyrighted content.

## Planning

GSD planning artifacts live in `.planning/`:

- `.planning/PROJECT.md` — project context and decisions
- `.planning/REQUIREMENTS.md` — v1 requirements
- `.planning/ROADMAP.md` — phased roadmap
- `.planning/research/` — domain and resource research
- `.planning/phases/01-foundation-content-model/01-CONTEXT.md` — Phase 1 implementation context

## Development Defaults

This is a greenfield web project. When implementation starts:

- Prefer `pnpm`.
- Prefer a static-first web stack unless requirements force server state.
- Keep content data structured and reviewable.
- Do not import third-party word lists, audio, images, or lesson text unless license and attribution are verified.

## Content Validation

Content validators use **uv** (Python package manager). Run them from the repo root:

```bash
# Run all validator self-tests
uv run python3 scripts/validate-pain-points.py
uv run python3 scripts/validate-script-status.py

# Validate a content file against the pain-point taxonomy
uv run python3 scripts/validate-pain-points.py --check <file>

# Validate a content file for script provenance fields
uv run python3 scripts/validate-script-status.py --check <file>
```

No additional dependencies are required — the validators are zero-dependency Python 3.
The project setup (`pyproject.toml`, `uv.lock`) lives in the repo root and is managed by `uv` only.

## Candidate Reference Sources

- [Learning Mandarin in Taiwan](https://lmit.edu.tw/)
- [TOCFL](https://tocfl.edu.tw/)
- [Taiwan Tourism Administration Japan site](https://jp.taiwan.net.tw/)
- [CC-CEDICT](https://cc-cedict.org/wiki/)
- [EDRDG license page](https://www.edrdg.org/edrdg/licence.html)
- [KanjiVG](https://kanjivg.tagaini.net/)
- [Unicode Unihan](https://www.unicode.org/charts/unihan.html)

All external resources are candidates until licensing and attribution are documented in the repo.

