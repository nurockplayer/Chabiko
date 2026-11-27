---
area: assets
owner: chabiko
updated: 2026-11-27 JST
---
# Static assets

- `public/audio/` — pre-generated pronunciation audio served by stable URL.
- `public/assets/vocabulary/` — learner-facing vocabulary imagery.
- `src/assets/` — bundled assets when imported by Astro (directory may be absent in a checkout).
- Font dependencies are declared in `package.json`; Astro bundles imported fonts and styles.
- Audio generation and voice comparison entry points are documented in [scripts.md](scripts.md).

Check rights and attribution records in the associated data before adding or replacing learner assets.
