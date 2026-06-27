# Research: Stack

## Recommendation

Use a static-first TypeScript web app with content stored as structured files. The default implementation path should be:

- pnpm workspace or single-package app
- Next.js, Astro, or Vite/React depending on the first implementation phase
- MDX or typed JSON/YAML content files for lessons, vocabulary, and phrasebook data
- Static hosting through Vercel, Netlify, Cloudflare Pages, or GitHub Pages
- Playwright for browser verification once UI exists

## Why

Chabiko's v1 value is content clarity, mobile reading, and lightweight practice. Accounts, server persistence, and complex CMS workflows are not required yet. A static-first approach keeps deployment simple, reduces production risk, and makes every content entry reviewable in GitHub.

## Data Shape Direction

Core content should be data-driven:

- `lessons`: title, level, learner outcome, sections, examples, review prompts
- `vocabulary`: traditional, pinyin, japanese, kana, category, tags, caution, source metadata
- `sentences`: traditional, pinyin, japanese, scenario, grammar notes, audio metadata
- `resources`: title, url, owner, license status, notes

## Avoid For V1

- Full backend CMS
- User accounts
- Speech recognition
- Scraping external sites
- Copying third-party word lists without license review

## Confidence

High. The v1 scope is content-heavy, public, and well suited to a static-first build.

