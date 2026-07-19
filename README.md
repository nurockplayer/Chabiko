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

## Production

- **URL:** [https://chabiko.pages.dev](https://chabiko.pages.dev)
- Deployed via [Cloudflare Pages](https://pages.cloudflare.com/) — connected to the `main` branch of the `nurockplayer/Chabiko` GitHub repository.
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Build output directory: `dist`
- Environment variables: `NODE_VERSION=24.18.0`, `PNPM_VERSION=10.33.0`, `SKIP_DEPENDENCY_INSTALL=1`

## Local Development

```bash
pnpm install
pnpm dev          # http://localhost:4321
pnpm build        # production build → dist/
pnpm preview      # preview the production build
pnpm lint         # ESLint
pnpm typecheck    # Astro type checking
pnpm test         # Vitest
```

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

Content validators use **uv** (Python 3.14+). Run them from the repo root:

```bash
# Run all validator self-tests
uv run python scripts/validate-pain-points.py
uv run python scripts/validate-script-status.py
uv run python scripts/validate-content-schema.py

# Validate a content file against the pain-point taxonomy
uv run python scripts/validate-pain-points.py --check <file>

# Validate a content file for script provenance fields
uv run python scripts/validate-script-status.py --check <file>

# Validate a content file against the full content schema
# (covers Lesson, Vocabulary, Sentence, Phrasebook, Practice, Resource)
uv run python scripts/validate-content-schema.py --check <file>

# Validate all seed examples
uv run python scripts/validate-content-schema.py --check data/examples/valid/lessons.json
uv run python scripts/validate-content-schema.py --check data/examples/valid/vocabulary.json
uv run python scripts/validate-content-schema.py --check data/examples/valid/sentences.json
uv run python scripts/validate-content-schema.py --check data/examples/valid/phrasebook.json
uv run python scripts/validate-content-schema.py --check data/examples/valid/practice.json
uv run python scripts/validate-content-schema.py --check data/examples/valid/resources.json

# Validate the candidate resource registry
uv run python scripts/validate-content-schema.py --check data/resources/candidate-resources.json
```

No additional dependencies are required — the validators are zero-dependency Python 3.14+.
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

## Docker Local Development

A minimal Docker-based environment is available for consistent local development.

### Setup

```bash
docker compose build
```

### Verify tooling is available

Use these commands to verify the Docker image has the expected tooling:

```bash
docker compose run --rm app node --version
docker compose run --rm app pnpm --version
docker compose run --rm app uv --version
```

### pnpm commands (deferred)

The Docker image provides **pnpm** for JavaScript tooling, but `pnpm install` / `pnpm dev` / `pnpm build`
require a `package.json` to be present. These commands become usable once the JS app scaffold is added:

```bash
# Install JS dependencies (requires package.json)
docker compose run --rm app pnpm install

# Start dev server (requires package.json)
docker compose run --rm --service-ports app pnpm dev

# Build for production (requires package.json)
docker compose run --rm app pnpm build
```

> The dev port (`3000`) is mapped in `docker-compose.yml` so `--service-ports` exposes it to the host (default: http://localhost:3000). Adjust the port after the app framework is chosen.
>
> A `command: pnpm dev` is intentionally omitted — the image has no `package.json` yet, so a baked-in dev command would make `docker compose up` fail until the app scaffold is added.

### uv-based content validators

The Docker image provides **uv** for Python content validation. These work immediately:

```bash
docker compose run --rm app uv run python scripts/validate-pain-points.py
docker compose run --rm app uv run python scripts/validate-script-status.py
docker compose run --rm app uv run python scripts/validate-content-schema.py

# Validate seed examples via Docker
docker compose run --rm app uv run python scripts/validate-content-schema.py --check data/examples/valid/lessons.json

# Validate candidate resource registry via Docker
docker compose run --rm app uv run python scripts/validate-content-schema.py --check data/resources/candidate-resources.json
```

### Notes

- The `app` service mounts the repo root so source changes are reflected immediately.
- Dependencies (`node_modules`, `.venv`) are stored in Docker named volumes, not written to the host working tree.
- To clean up all volumes: `docker compose down -v`
- The same tooling rules apply inside Docker: **pnpm** for JavaScript, **uv** for Python.

