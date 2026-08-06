# Unicode Rendering Inventory

**Status:** Draft for #259 (parent #33)
**Last updated:** 2026-08-06
**Based on:** #18 Dual-Script and Regional Variant Strategy, #70 Deterministic Visual Regression
**Alignment:** Phase 1 content architecture

---

## 1. Purpose

This document records the exact rendering environments, font inputs, and rights
status available to the Chabiko repository workflow for Unicode/glyph
comparison work. It is a **metadata and provenance inventory only**: it names
fonts and their sources, it does **not** commit, vendor, or redistribute any
font bytes. Every entry records the rights status and the operations that entry
may be used for, so later glyph-comparison work can pick an input without
re-deriving licensing facts.

Two hard disclaimers apply to every comparison made with these inputs:

- **Same code point does not imply identical glyph.** Two fonts can both map a
  given Unicode code point yet render visibly different shapes (e.g., the CJK
  unified ideograph U+9AA8 骨 renders differently in Songti, Heiti, Kaiti, and
  Noto Sans JP). Glyph shape is a property of the font, not of the code point.
- **Visual similarity implies no semantic/pronunciation/etymology relation.**
  Two characters that look alike (e.g., Japanese 骨 and Chinese 骨) may be
  unrelated in meaning, reading, or origin. Never derive semantic claims from
  glyph resemblance; treat resemblance only as a signal that requires content
  provenance and review (see `dual-script-and-regional-variant-strategy.md`).

---

## 2. Rendering Environments

### 2.1 Local development host

Captured from the machine that runs the repository workflow
(worktree `wave-259-unicode`, macOS host).

| Component | Version / Value |
|-----------|-----------------|
| OS | macOS 15.7.4 (Darwin 24.6.0) |
| Architecture | arm64 |
| Node.js | v24.15.0 |
| pnpm | 10.33.0 (matches `packageManager` in `package.json`) |
| npm | 11.17.0 (bundled; not the repo package manager) |
| uv | 0.10.9 (Homebrew) |
| Python | 3.14.3 (matches `.python-version`) |
| Docker | 29.4.0 |
| Pillow (uv env) | 12.3.0, built with FreeType (can load `.ttc`/`.ttf` for glyph metrics) |
| fontconfig | available via Homebrew (`fc-list`, `fc-match`) |

### 2.2 CI (GitHub Actions)

| Job | Runner | Runtime |
|-----|--------|---------|
| app (lint/typecheck/test/build) | `ubuntu-24.04` | Node 24, pnpm via `pnpm/action-setup@v4`, `pnpm install --frozen-lockfile` |
| visual (visual regression) | `ubuntu-24.04` | `pnpm test:visual` (Docker) |
| content (validation) | `ubuntu-24.04` | Python 3.14 via `actions/setup-python@v5`, `uv run --locked` |

The `ubuntu-24.04` base image provides Debian-packaged fonts only; Apple fonts
are **not** present. Any comparison that must run in CI must use a
repository-approved redistributable font (Section 3.1), never a macOS
system font.

### 2.3 Deterministic visual harness (the pinned reference renderer)

From `docs/qa/visual-regression.md` and `tests/visual/run.ts`:

| Component | Value |
|-----------|-------|
| Playwright | `@playwright/test` `1.61.1` |
| Chromium | Google Chrome for Testing `149.0.7827.55` (revision 1228) |
| Firefox (bundled) | `151.0` (revision 1532) |
| WebKit (bundled) | `26.5` (revision 2311) |
| Image | `mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48` (`v1.61.1-noble`) |
| Container OS | Ubuntu 24.04.4 LTS (noble), `node` v24.17.0, Docker `--platform=linux/amd64` |
| Test font (fixed) | `Noto Sans JP Variable` (`@fontsource-variable/noto-sans-jp` `5.3.0`) loaded by the test helper and forced on every element |

Determinism controls enforced by the harness: one Chromium worker, headless,
CSS-pixel scale, `deviceScaleFactor: 1`, sRGB, `--disable-lcd-text`,
`--font-render-hinting=none`, `--force-color-profile=srgb`, locale `ja-JP`,
timezone `Asia/Tokyo`, reduced motion, fixed clock, network boundary that
blocks all external requests, and `threshold: 0` / `maxDiffPixels: 0` pixel
comparison. These same controls are the required baseline for any future
deterministic glyph-capture work: no antialiasing or hinting variance, no
system-font fallback, one isolated browser context per case.

### 2.4 App container (non-rendering baseline)

`Dockerfile` is `FROM node:24-slim` with corepack pnpm and uv installed. It is
used for app build/run, not for glyph rendering; it installs no CJK fonts, so
it is **not** a rendering environment for CJK glyph comparison.

### 2.5 Unsupported / non-deterministic environments

| Environment | Status | Reason |
|-------------|--------|--------|
| Arbitrary macOS browser (Safari/Chrome desktop) | **Not for glyph comparison** | Uses Apple system font fallback (PingFang/Hiragino) whose exact rendering is not pinned; results are host- and version-dependent |
| Android / iOS system fonts | **Unavailable** | Not installed on the development host; no committed font bytes |
| `astro dev` server | **Not a capture target** | The visual harness renders the production `astro build` served by `astro preview`, not the dev server |
| `node:24-slim` app container | **Not a rendering environment** | Ships no CJK fonts |

---

## 3. Font Inputs and Rights Status

Rights status vocabulary (non-blocking outcomes are valid and expected):
`repository-owned`, `redistributable`, `system-only`, `unavailable`, `unknown`.

### 3.1 Repository-approved redistributable fonts

| Font family | Package / source | Version | Rights status | Allowed operations |
|-------------|------------------|---------|---------------|--------------------|
| Noto Sans JP Variable | `@fontsource-variable/noto-sans-jp` (pnpm dependency) | `5.3.0` (Noto Sans JP v56) | `redistributable` — SIL OFL-1.1, copyright Google Inc. | mechanical extraction, screenshot evidence, review |

Details: the package ships 124 Unicode-range `.woff2` slices under
`node_modules/@fontsource-variable/noto-sans-jp/files/`, plus
`unicode.json`/`metadata.json` describing per-subset code point ranges
(subsets: `cyrillic`, `japanese`, `latin`, `latin-ext`, `vietnamese`). It is
already a pinned, frozen-lockfile dependency, so glyphs can be extracted and
compared without adding any asset to the repository. The visual harness
already serves these files through `route.fulfill` under `/__visual-fonts/`
with `font-display: block`. `metadata.json` records
`license: OFL-1.1`, `attribution: Google Inc.`, `source: github.com/google/fonts`.

### 3.2 CI container system fonts (Ubuntu packages, `v1.61.1-noble`)

Installed under `/usr/share/fonts` in the pinned Playwright image. These are
present on CI/`test:visual` but are **not** committed bytes; their licenses vary
and only the OFL/GPL-exception entries are usable for mechanical extraction
that must survive redistribution.

| Font family | Package (Ubuntu) | Version | Rights status | Allowed operations |
|-------------|------------------|---------|---------------|--------------------|
| IPAGothic / IPA P Gothic | `fonts-ipafont-gothic` | `00303-21ubuntu1` | `redistributable` — IPA Font License Agreement v1.0 | mechanical extraction, screenshot evidence, review |
| WenQuanYi Zen Hei | `fonts-wqy-zenhei` | `0.9.45-8` | `redistributable` — GPL-2 with font-embedding exception + M+ FONTS License | mechanical extraction, screenshot evidence, review |
| Liberation Sans/Serif/Mono | `fonts-liberation` | `1:2.1.5-3` | `redistributable` — SIL OFL-1.1 | mechanical extraction, screenshot evidence, review |
| FreeSans/FreeSerif/FreeMono | `fonts-freefont-ttf` | `20211204+svn4273-2` | `redistributable` — GPL-3+ with font-exception | mechanical extraction, screenshot evidence, review |
| Unifont | `fonts-unifont` | `1:15.1.01-1build1` | `redistributable` — GPL-2+ (plus GFDL for some data) | mechanical extraction, screenshot evidence, review |
| Noto Color Emoji | `fonts-noto-color-emoji` | `2.047-0ubuntu0.24.04.1` | `redistributable` — OFL-1.1 | mechanical extraction, screenshot evidence, review |
| Loma (Thai) | `fonts-tlwg-loma-otf` | `1:0.7.3-1` | `redistributable` — GPL-2+ with font-exception (Thai; not CJK) | review only |

Note: the container holds **no** Noto Sans CJK / Source Han fonts. For CJK glyph
comparison in CI, use Noto Sans JP from `@fontsource-variable/noto-sans-jp`
(Section 3.1); the container's CJK coverage is limited to WenQuanYi Zen Hei
(GB-focused) and IPA Gothic (JP-focused).

### 3.3 macOS system fonts (host only)

Installed on the development host. These are **not** committed and **not**
redistributable; they are usable for local inspection and review only, never
for committed artifacts or CI.

| Font family | Location | Rights status | Allowed operations |
|-------------|----------|---------------|--------------------|
| PingFang TC / SC / HK / MO | `/System/Library/AssetsV2/...MobileAsset_Font7/.../PingFang.ttc` | `system-only` — Apple proprietary | review only (local) |
| Hiragino Sans (Kaku Gothic ProN, Maru Gothic, Mincho Pro) | `/System/Library/Fonts/ヒラギノ角ゴシック*.ttc`, `ヒラギノ明朝 ProN.ttc` | `system-only` — proprietary | review only (local) |
| Hiragino Sans GB / CNS | `/System/Library/Fonts/Hiragino Sans GB.ttc` | `system-only` — proprietary | review only (local) |
| Songti TC / SC | `/System/Library/Fonts/Supplemental/Songti.ttc` (66,933,080 bytes) | `system-only` — Apple proprietary | review only (local); loadable via Pillow for local metrics |
| Kaiti SC/TC, STKaiti | `/System/Library/AssetsV2/.../Kaiti.ttc` | `system-only` — proprietary | review only (local) |
| BiauKaiTC / BiauKaiHK | `/System/Library/AssetsV2/.../BiauKai.ttc` | `system-only` — proprietary | review only (local) |
| Heiti SC/TC | `/System/Library/Fonts/STHeiti Light.ttc`, `STHeiti Medium.ttc` | `system-only` — proprietary | review only (local) |
| Apple LiSung / LiGothic | `/System/Library/Fonts/Supplemental/` | `system-only` — proprietary | review only (local) |
| Arial, Arial Unicode MS | `/System/Library/Fonts/Supplemental/Arial*.ttf` | `system-only` — proprietary (monotype sublicensed) | review only (local) |

`fc-list` reports these under `/System/Library/AssetsV2/...MobileAsset_Font7`
paths; those directories are on-demand-delivered Apple assets and may change
per macOS version. Treat **all** macOS CJK font file paths as host-specific and
non-portable.

### 3.4 Product font stacks (referenced, not rendered here)

`src/layouts/BaseLayout.astro` defines **two** sets of learner-facing font
variables. The active set depends on `themeEnabled`, a page prop that defaults
to `false` (`const { themeEnabled = false } = Astro.props`); the
`data-theme-enabled` attribute is set on `<html>` only when a page opts in.
No `@fontsource` stylesheet is imported in `src/`, so the app ships no webfont
and renders via the learner's system fonts in both blocks.

Default `:root` block (theme disabled, `data-theme-enabled` absent):

- `--font-zh`: `'PingFang TC', 'Noto Sans TC', 'Hiragino Sans', sans-serif`
- `--font-ja`: `-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', sans-serif`
- `--font-pinyin`: `'Hiragino Sans', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif`

Theme-enabled `:root[data-theme-enabled='true']` block (opted-in pages):

- `--font-zh`: `'PingFang TC', 'Noto Sans TC', 'Hiragino Sans', sans-serif`
- `--font-ja`: `'Hiragino Sans', 'Noto Sans JP', 'Helvetica Neue', Arial, sans-serif`
- `--font-pinyin`: `'Hiragino Sans', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif`

Runtime impact for CJK fallback: when the default block is active, `--font-ja`
resolves through the Apple system stack and can fall back to **`Noto Sans CJK
JP`** or another macOS system CJK font; when the theme-enabled block is active,
the CJK fallback target is instead **`Noto Sans JP`**. Both stacks rely on
system-installed fonts (neither `Noto Sans CJK JP` nor `Noto Sans JP` is
bundled), so which face actually renders a CJK glyph is host- and
installation-dependent and **not** reproducible in CI unless a comparison font
is explicitly forced. These stacks are the **runtime** surface that later
issues may need to make deterministic; the inventory's pinned comparison fonts
(Sections 3.1–3.2) are the deterministic stand-ins.

### 3.5 Python validation tooling

`pyproject.toml` pins `Pillow==12.3.0`. In the uv environment, `Pillow` is built
with FreeType, so `ImageFont.truetype()` can load local `.ttf`/`.ttc` files for
glyph metric extraction (verified against `Songti.ttc`, `Hiragino Sans GB.ttc`).
Pillow is a validation/rasterization input, not a font source.

---

## 4. Locale/Script Coverage and Fallback Behavior

| Input | Script coverage (primary) | Known fallback behavior |
|-------|---------------------------|-------------------------|
| Noto Sans JP Variable | Japanese (JP), Latin; covers common CJK unified ideographs | Designed for Japanese; GB/TW-specific glyph shapes are not guaranteed — a code point shared with Chinese may render with the Japanese glyph variant |
| WenQuanYi Zen Hei | Simplified Chinese (GB), CJK ext | Lacks many Traditional/TW-specific glyphs; falls back per fontconfig when a glyph is missing |
| IPA Gothic | Japanese, JIS X 0208 | JIS coverage only; non-JIS code points are absent |
| Liberation / FreeFont / Unifont | Latin / broad BMP fallback | Unifont covers the full BMP with bitmap-like outlines (usable as a "does a glyph exist" probe, not a quality reference) |
| PingFang TC / SC | Traditional (TC) / Simplified (SC) | TC and SC are separate faces; the browser picks by `lang`/font-family and may synthesize weight |
| Songti TC / SC | Traditional / Simplified serif | TTC holds both; `font-family` `Songti TC` vs `Songti SC` selects the face |
| Kaiti / BiauKai | Traditional/Simplified kai style | Host-only; not present in CI |

Fallback rule for glyph comparison: **pin the font explicitly and never rely on
the browser's default fallback.** The visual harness already enforces this by
forcing `Noto Sans JP Variable` on every element with `font-synthesis: none`.

---

## 5. Allowed-Use Matrix

| Input | Mechanical extraction | Screenshot evidence | Review only | Not at all |
|-------|-----------------------|---------------------|-------------|------------|
| `@fontsource-variable/noto-sans-jp` (Noto Sans JP Variable, OFL-1.1) | yes | yes | yes | — |
| Container: IPAGothic, WenQuanYi Zen Hei, Liberation, FreeFont, Unifont, Noto Color Emoji | yes (Ubuntu packages in CI) | yes | yes | — |
| Container: Loma (Thai) | no | no | yes | — |
| macOS PingFang / Hiragino / Songti / Kaiti / BiauKai / Heiti / Arial | no | no | yes | — |
| macOS Apple LiSung / LiGothic / other Apple system fonts | no | no | yes | — |
| Font bytes committed into this repository | no | no | no | **never** (issue #259 commits none) |
| Any font with `unknown` rights | no | no | no | **never** |

Rule: only `redistributable` inputs (OFL / IPA / GPL-with-font-exception) may be
used for mechanical extraction or committed screenshot evidence. `system-only`
inputs are local review aids. `unknown`-rights fonts are never used. No font
bytes are added to the repository by this issue.

---

## 6. Deterministic Rendering Constraints

To produce comparable glyph output:

1. **Renderer:** the pinned Playwright image
   (`sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48`)
   with Chromium `149.0.7827.55`; or Pillow `12.3.0` in the uv environment for
   metric-only extraction.
2. **Font:** force one named family per capture; disable synthesis and system
   fallback; for CJK use Noto Sans JP Variable or an explicit container font.
3. **Anti-aliasing/hinting:** keep the harness flags (`--disable-lcd-text`,
   `--font-render-hinting=none`, `--force-color-profile=srgb`, `scale: 'css'`,
   `deviceScaleFactor: 1`); never compare screenshots produced under different
   hinting settings.
4. **Locale/time:** `ja-JP`, `Asia/Tokyo`, fixed clock, reduced motion, one
   isolated browser context per case.
5. **Network:** block external requests; load fonts from local files only.

---

## 7. Non-Goals (This Issue Does Not Do)

- Commit, vendor, or redistribute any font bytes, screenshots, or datasets.
- Choose which glyph pairs to compare, or define a comparison schema/script.
- Resolve every licensing uncertainty to "perfect" certainty — `system-only`,
  `unknown`, and not-yet-licensed outcomes are valid and non-blocking.

---

## 8. Relationship to Other Documents

| Document | Relationship |
|----------|--------------|
| `docs/qa/visual-regression.md` | Defines the pinned Playwright harness whose image/version/font this inventory records |
| `docs/content/dual-script-and-regional-variant-strategy.md` | Glyph-shape and script-form policy; visual similarity never implies semantic relation |
| `tests/visual/run.ts`, `tests/visual/helpers.ts` | Source of the pinned image digest and the forced `Noto Sans JP Variable` test font |
| `package.json`, `pyproject.toml` | Dependency pins referenced above |

---

*This document is a metadata/provenance inventory for Unicode/glyph comparison
work (#259, parent #33). Revisit when the pinned Playwright image, Node/pnpm
baseline, or repository font dependencies change.*
