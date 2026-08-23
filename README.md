# Chabiko | チャビコ

Chabiko is a Japanese-first Mandarin Chinese learning website. Its learner goal is to take a complete beginner from “I know kanji, but not Mandarin” toward practical recognition and simple Chinese they can use while traveling in Taiwan.

## Product Direction

- Short learning sessions that are easy to continue.
- Exactly three first-class learner tracks in the current product architecture: `先生厳選単語`, `HSK`, and `台湾旅行`.
- Chinese is dual-script. Taiwan Travel is Traditional-first; HSK, school-study, and general Mandarin surfaces may default to Simplified when their owning content/route contract says so.
- Product UI and explanations remain Japanese-first.
- Use Japanese explanations, pinyin, and carefully scoped kanji/reading comparisons to lower the entry barrier without inventing linguistic relationships.
- Travel-first scenarios include airport, transport, food, shopping/payment, hotels, and emergencies.
- Curated external resources remain subject to repository rights/provenance gates; do not copy third-party content merely because a source is publicly reachable.

## Production

- **URL:** [https://chabiko.pages.dev](https://chabiko.pages.dev)
- Deployed via [Cloudflare Pages](https://pages.cloudflare.com/) from the `main` branch of `nurockplayer/Chabiko`.
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Build output directory: `dist`
- Current deployment variables include `NODE_VERSION=24.18.0`, `PNPM_VERSION=10.33.0`, and `SKIP_DEPENDENCY_INSTALL=1`.

## Repository Authority

Start implementation from the current GitHub issue and [`AGENTS.md`](AGENTS.md). The repository documentation status map is [`docs/README.md`](docs/README.md).

The `.planning/` tree is historical planning evidence, not a current project-state ledger. See [`.planning/README.md`](.planning/README.md). Do not use old roadmap/phase text to override a live issue, current merged implementation, or an explicitly adopted active contract.

English is the canonical language for repository technical artifacts. See [`docs/engineering/repository-language-policy.md`](docs/engineering/repository-language-policy.md). Learner-facing Japanese/Chinese, localization, and language-learning data remain in the languages required by product behavior.

## Current Development Baseline

This is an implemented, deployed product rather than a greenfield scaffold. The current stack and repository behavior are the baseline unless the owning issue explicitly changes them:

- Astro
- TypeScript
- pnpm
- Vitest
- Playwright-based visual/accessibility gates
- structured content files and deterministic validation tooling
- uv + Python 3.14+ content validators
- localStorage-based v1 learner progress/preferences where defined by the owning feature contract

Do not reselect the framework or rebuild the scaffold for ordinary feature work.

## Local Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production build → dist/
pnpm preview      # preview the production build
pnpm lint         # ESLint
pnpm typecheck    # Astro/TypeScript checking
pnpm test         # Vitest
```

Use the validation command required by the current issue/risk classifier. Cross-cutting or release-sensitive work may require `pnpm validate:full`, visual, accessibility, content, rights, or provenance gates in addition to the basic commands above.

## Content Validation

Content validators use **uv** (Python 3.14+). Run them from the repo root:

```bash
# Run validator self-tests
uv run python scripts/validate-pain-points.py
uv run python scripts/validate-script-status.py
uv run python scripts/validate-content-schema.py

# Validate a specific content file
uv run python scripts/validate-pain-points.py --check <file>
uv run python scripts/validate-script-status.py --check <file>
uv run python scripts/validate-content-schema.py --check <file>

# Validate representative canonical examples
uv run python scripts/validate-content-schema.py --check data/examples/valid/lessons.json
uv run python scripts/validate-content-schema.py --check data/examples/valid/vocabulary.json
uv run python scripts/validate-content-schema.py --check data/examples/valid/sentences.json
uv run python scripts/validate-content-schema.py --check data/examples/valid/phrasebook.json
uv run python scripts/validate-content-schema.py --check data/examples/valid/practice.json
uv run python scripts/validate-content-schema.py --check data/examples/valid/resources.json

# Validate the candidate resource registry
uv run python scripts/validate-content-schema.py --check data/resources/candidate-resources.json
```

The Python validation environment is managed by the repository `pyproject.toml` / `uv.lock`. Follow the owning issue and current scripts rather than copying historical command lists when they diverge.

## Candidate Reference Sources

- [Learning Mandarin in Taiwan](https://lmit.edu.tw/)
- [TOCFL](https://tocfl.edu.tw/)
- [Taiwan Tourism Administration Japan site](https://jp.taiwan.net.tw/)
- [CC-CEDICT](https://cc-cedict.org/wiki/)
- [EDRDG license page](https://www.edrdg.org/edrdg/licence.html)
- [KanjiVG](https://kanjivg.tagaini.net/)
- [Unicode Unihan](https://www.unicode.org/charts/unihan.html)

These links are candidate/reference sources only. Learner-facing publication still follows the repository's explicit source, license, attribution, provenance, and human-review gates.

## Docker Local Development

A Docker-based environment remains available for consistent local tooling where needed.

```bash
docker compose build

docker compose run --rm app node --version
docker compose run --rm app pnpm --version
docker compose run --rm app uv --version

docker compose run --rm app pnpm install
docker compose run --rm --service-ports app pnpm dev
docker compose run --rm app pnpm build
```

The `app` service mounts the repository root; dependency volumes stay outside the host working tree. Use `docker compose down -v` only when intentionally removing Docker volumes. Browser/visual test execution may use repository-specific pinned container commands defined by the current test tooling; do not substitute an ad-hoc renderer when exact screenshot evidence is required.
