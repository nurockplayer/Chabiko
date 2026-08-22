# Direction Review: Prototype Score and Selection

> **Historical Direction C / Issue #60 record.** This document records the
> evaluation that selected Direction C and remains an immutable review record.
> The canonical learner-facing visual target is A1 Editorial Calm, frozen in
> `reference-family-389.md`; its core production propagation is complete, and
> remaining work is owned by live GitHub Issues. Direction C is not the current
> production contract.

> Part of Issue #60. Independent evaluation of three visual prototype directions
> for Chabiko's learner-facing UI redesign.

## Rubric Reference

Fixed 100-point rubric from Issue #56 (`docs/design/design-brief.md` section 4):

| Criterion | Weight |
|---|---|
| Visual hierarchy | 20 |
| Japanese/Chinese readability | 20 |
| Mobile usability | 15 |
| Brand distinctiveness | 15 |
| Consistency | 10 |
| Accessibility | 10 |
| Dark-mode readiness | 5 |
| Implementation feasibility | 5 |
| **Total** | **100** |

Weights verified: 20 + 20 + 15 + 15 + 10 + 10 + 5 + 5 = **100** ✓

## Immutable Evidence

All evidence collected from `origin/main` (`1cfe75f6`) after merged evidence
corrections #145/#147 (direction B, `0bb827bc`), #146/#148 (direction C,
`26c12b51`), and #155/#156 (direction A, `1cfe75f6`).

| Evidence | Path | Status |
|---|---|---|
| Design brief & rubric | `docs/design/design-brief.md` | ✓ |
| UI audit | `docs/design/ui-audit.md` | ✓ |
| Shared content fixture | `docs/design/prototype-content.md` | ✓ |
| Direction A rules | `docs/design/prototypes/direction-a-editorial.md` | ✓ |
| Direction B rules | `docs/design/prototypes/direction-b-learning-app.md` | ✓ |
| Direction C rules | `docs/design/prototypes/direction-c-city-exploration.md` | ✓ |
| Direction A HTML | `docs/design/prototypes/direction-a-editorial.html` | ✓ |
| Direction B HTML | `docs/design/prototypes/direction-b-learning-app.html` | ✓ |
| Direction C HTML | `docs/design/prototypes/direction-c-city-exploration.html` | ✓ |
| A mobile | `docs/design/prototypes/direction-a-editorial-mobile.png` | ✓ |
| A desktop | `docs/design/prototypes/direction-a-editorial-desktop.png` | ✓ |
| B mobile | `docs/design/prototypes/direction-b-learning-app-mobile.png` | ✓ |
| B desktop | `docs/design/prototypes/direction-b-learning-app-desktop.png` | ✓ |
| C mobile | `docs/design/prototypes/direction-c-city-exploration-mobile.png` | ✓ |
| C desktop | `docs/design/prototypes/direction-c-city-exploration-desktop.png` | ✓ |

All six screenshots use equivalent viewports (mobile 390×844, desktop 1440×900)
as verified from PNG IHDR chunk headers at the reviewed `main` head.

### Evidence Provenance

- **Screenshot dimensions:** Verified from PNG IHDR chunk headers on each file
  at the reviewed `main` head. All six match the required viewports
  (390×844 mobile, 1440×900 desktop).
- **Colour and text appearance:** Extracted from the HTML prototype source files
  and their embedded CSS style blocks. Each scoring row references specific
  CSS selectors, class names, and line numbers from the reviewed `main` HTML
  files.
- **Contrast ratios:** Computed from the effective rendered foreground and
  background colours. Hex values were used directly; `rgba()` foreground
  colours were alpha-composited over their declared background before applying
  the WCAG relative-luminance formula. Thresholds: 4.5:1 for normal text, 3.0:1
  for large text (≥24px or ≥19px bold). Direction C audit includes
  `rgba(255,255,255,0.9)` over `#1a2744` (header navigation links) and
  `rgba(255,255,255,0.6)` over `#1a2744` (script-toggle placeholder) — both
  alpha-composited and verified as passing WCAG AA.

## Scoring

### Direction A: Japanese Editorial Travel Guide — 87/100

| Category | Weight | Score | Evidence | Weakness | Accessibility risk | Implementation risk |
|---|---|---|---|---|---|---|
| Visual hierarchy | 20 | 18 | Chinese 2.5rem Noto Serif TC (hero `sentence-hero__zh`, `line 272`) vs pinyin 0.9375rem muted (`sentence-hero__pinyin`, `line 281`) vs Japanese 0.875rem secondary (`sentence-hero__ja`, `line 289`); numbered red section badges provide chapter-like structure; learner hierarchy (Chinese→pinyin→Japanese→action) consistent across home, lesson, and vocabulary sections | Example sentence Chinese (1.25rem `line 363`) is close in size to surrounding Japanese body text (0.875rem `line 373`) — hierarchy could be sharper in body content | none observed | none observed |
| Japanese/Chinese readability | 20 | 18 | Noto Serif TC (Chinese, `--font-zh line 43`) vs Noto Sans JP (Japanese, `--font-ja line 44`) provides clear linguistic differentiation; `line-height: 1.7` body, `1.3` headings; 360px safeguard at `≤360px` reduces hero from 2.5rem to 2rem (`lines 719-720`) | 4-column chunk table at 390px with columns 語句/ピンイン/意味/備考 is tight — cells wrap at narrow widths | none observed | none observed |
| Mobile usability | 15 | 14 | Touch targets ≥44px (nav `min-height: 44px`, buttons `padding: 14px 24px`); 640px max-width centred; 360px safeguard (font-size 15px, hero 2rem, progress-summary flex-column, `lines 718-722`) | Chunk table at ≤360px may cause horizontal overflow; `:target`-based demo toggles (`lines 730-738`) need JS for real interaction | `:target`-based feedback toggles inaccessible without JS — must use JS or server-rendered state in production | none observed |
| Brand distinctiveness | 15 | 15 | Warm off-white `#faf7f2` + red `#b8432f` / terracotta `#d4764a` palette directly embodies "Tokyo-published Taiwan travel guidebook" from design brief; no generic blue, SaaS, or Duolingo elements; numbered red circle badges (`section-heading__number`) evoke guidebook chapter markers | none observed | none observed | none observed |
| Consistency | 10 | 9 | Section-heading pattern, palette, spacing uniform across home, lesson, and vocabulary sections | Card treatment varies by context (left border on path cards, gradient top bar on sentence hero, plain border on info blocks, terracotta left border on note cards) — intentional editorial variety but reduces visual consistency | none observed | none observed |
| Accessibility | 10 | 7 | Focus-visible on interactive controls (`lines 82-85, 120-123, 437-440, 524-527`); touch targets ≥44px; state uses colour + text + icons. Body text `#2c2420` on `#faf7f2` ≈ 14.24:1 ✓ | **4 normal-text contrast failures** (WCAG calculation, verified against HTML CSS declarations at `lines 27-53, 271-291, 310-349, 370-401, 445-476`): section alternate badge white `#ffffff` on terracotta `#d4764a` (0.75rem, `section-heading__number` variants with `background:var(--color-accent-warm)`) 3.24:1; status pill accent `#b8432f` on blush `#e8d5cc` (0.75rem, `path-row__status` with `background:var(--color-accent-soft)`) 3.82:1; correct-answer highlight `#4a7c59` on error-bg `#f7edec` (0.875rem, `feedback__correct-answer`) 4.23:1; pending status `#736b64` on `#f0eae4` (0.75rem, `path-row__status--pending`) 4.38:1. Lesson Chinese/pinyin content sections lack explicit `lang` attributes (vocabulary section has `zh-Hans`, `zh-Hant`, `zh-Latn`, `ja`). `:target`-based feedback toggle not screen-reader accessible without JS | current contrast failures in 4 text pairings may reduce readability for users with moderate vision loss | none observed |
| Dark-mode readiness | 5 | 1 | All colours hardcoded as light-mode hex values in `:root` (`lines 27-53`) | No semantic light/dark token layer or reviewable dark-theme palette is present; all prototype colours are defined as light-only values | No dark-theme evidence exists, so dark-theme contrast cannot be verified | Semantic light/dark token values and selector ownership remain to be frozen by #61/#62 |
| Implementation feasibility | 5 | 5 | Pure CSS custom properties (`lines 27-53`); no JS dependency or CSS-in-JS; uses standard CSS layout (flexbox, grid at 1024px+); preserves all Astro page patterns | none observed | none observed | none observed |
| **Total** | **100** | **87** | | | | |

Subtotal: 18 + 18 + 14 + 15 + 9 + 7 + 1 + 5 = **87** ✓

### Direction B: Premium Modern Learning App — 84/100

| Category | Weight | Score | Evidence | Weakness | Accessibility risk | Implementation risk |
|---|---|---|---|---|---|---|
| Visual hierarchy | 20 | 18 | Chinese 2.75rem bold sans-serif (`phrase-card__zh`, `line 323-330`) clearly dominant; pinyin 0.875rem muted letter-spaced (`line 332-338`); Japanese 0.9375rem secondary (`line 339-343`); learner hierarchy consistently applied | Lesson item example Chinese uses accent teal colour (`lesson-item__example`, `line 258-263`) — teal Chinese text competes with title hierarchy for attention | none observed | none observed |
| Japanese/Chinese readability | 20 | 17 | Hiragino Sans/PingFang TC excellent CJK rendering (`line 45`); `overflow-wrap: break-word` prevents overflow (`line 23`); 2.75rem Chinese comfortable at mobile; 360px safeguard (`lines 674-678`) | Chinese and Japanese share same sans-serif font family (`--font-zh` and `--font-ja` both use Hiragino Sans at `lines 45-46`) — less visual differentiation between languages than Direction A's serif/sans pairing | none observed | none observed |
| Mobile usability | 15 | 14 | Quiz choices `min-height: 52px` (`line 503`), nav `min-height: 44px` (`line 90`); 360px safeguard (15px font, stacked chunks `lines 674-678`); single-column layout natural on mobile | Lesson nav touch targets (44px `line 589`) adequate but not generous | none observed | none observed |
| Brand distinctiveness | 15 | 11 | Teal `#0f766e` + slate `#f4f7fc` palette avoids generic blue SaaS; polished, calm, adult-oriented | "Premium learning app" does not specifically evoke the "travel guidebook" product trait from the design brief (section 2); could pass for a well-designed general edtech product without Taiwan/travel identity | none observed | none observed |
| Consistency | 10 | 9 | Highly uniform: `border-radius: 10px` cards, `8px` buttons, `box-shadow: 0 1px 3px` throughout; spacing scale consistent; type scale uniform | Tip cards use `--color-accent-light` background (`tip-card`, `line 440`) rather than `--color-surface` — minor visual break from the card system | none observed | none observed |
| Accessibility | 10 | 9 | WCAG AA contrast (all meaningful text pairs verified ≥4.81:1 — 0 contrast failures); `:focus-visible` 2px teal + 2px offset (`lines 128-131, 216-219, 509-512, 598-601`); touch targets ≥44px; icons + text labels on all states (e.g. `lesson-item__status` with text + icon, `line 266-284`). Error icon white ✕ on `#dc2626` measures 4.83:1 — passes WCAG AA | Lesson Chinese/pinyin content elements lack explicit `lang="zh-Hant"` and `lang="zh-Latn"` attributes (vocabulary section correctly has `lang="zh-Hant"` on `line 780`, lesson section `lines 745-762` does not). Feedback toggles use `:target` (`lines 682-685`) without `role="status"` or `aria-live` — state changes are not announced to assistive technology | Missing lesson-language metadata may produce incorrect pronunciation in assistive technology, and hash-target feedback changes may not be announced | none observed |
| Dark-mode readiness | 5 | 1 | All colours hardcoded light-mode hex values (`lines 28-60`) | No semantic light/dark token layer or reviewable dark-theme palette is present; all prototype colours are defined as light-only values | No dark-theme evidence exists, so dark-theme contrast cannot be verified | Semantic light/dark token values and selector ownership remain to be frozen by #61/#62 |
| Implementation feasibility | 5 | 5 | Pure CSS custom properties; no JS dependency; preserves all Astro patterns | none observed | none observed | none observed |
| **Total** | **100** | **84** | | | | |

Subtotal: 18 + 17 + 14 + 11 + 9 + 9 + 1 + 5 = **84** ✓

### Direction C: Taiwan City Exploration — 87/100

| Category | Weight | Score | Evidence | Weakness | Accessibility risk | Implementation risk |
|---|---|---|---|---|---|---|
| Visual hierarchy | 20 | 18 | Chinese 2.75rem bold sans-serif (3rem desktop, `phrase-card__chinese line 332-339`, `line 864`) clearly dominant; pinyin 1rem muted (`line 340-346`); Japanese 1rem body (`line 347-353`); route panel adds wayfinding context | Desktop two-column layout (`app-layout grid`, `lines 835-840`) has route panel on left and content on right — two visual centres compete for attention above the fold | none observed | desktop two-column grid with sticky route panel adds layout complexity beyond a single-column approach |
| Japanese/Chinese readability | 20 | 18 | Bold sans-serif Chinese with letter-spacing highly legible; dedicated narrow-mobile breakpoints (`lines 872-900`: 320-374px) and mid-small (`lines 903-907`: 375-389px) prevent crowding at all required viewports | Route panel station text (`station__can-do 0.75rem line 233-238`, `station__num 0.75rem line 216`) is small at mobile widths | none observed | none observed |
| Mobile usability | 15 | 14 | Best narrow-mobile handling: 3 dedicated breakpoints (320-374px, 375-389px, 1024px+); touch targets ≥44px (nav `min-height: 44px` + `min-width: 44px` `line 113-117`, quiz `min-height: 52px` `line 388`); responsive padding (`line 872-900`) | Route panel flows above content on mobile — adds vertical scroll before learner reaches lesson content | none observed | none observed |
| Brand distinctiveness | 15 | 14 | Deep indigo `#1a2744` + warm amber `#d48c2b` palette is highly distinctive; route/station timeline progress metaphor is novel for language learning; evokes Taipei identity (MRT signage, night-market warmth) without tourist-poster imagery | Wayfinding/metro metaphor is transit-oriented — less directly aligned with the brief's "slim Tokyo-published Taiwan travel guidebook" target than Direction A's editorial approach | none observed | none observed |
| Consistency | 10 | 9 | Station motif consistent throughout; indigo/amber palette uniform; typography system coherent; semantic landmarks (`<aside>` route, `<main>` content) consistent | Quiz section shows pre-selected correct state (`quiz-choice--correct` on first option `line 1035`) — static prototype displays multiple answer and feedback states simultaneously, which is convenient for review but does not represent a single real interaction state | none observed | none observed |
| Accessibility | 10 | 9 | Best of three: `aria-current="step"` (`line 954`), `aria-live="polite"` with `role="status"` (`line 1050`), `aria-label` on nav and quiz (`lines 938, 1035`), `aria-hidden` on decorative elements; semantic `<aside>` + `<main>` + `<nav>` + `<section aria-labelledby>`; global `:focus-visible` 2px + 3px offset (`lines 910-913`); all meaningful UI text pairs verified ≥4.69:1 — 0 contrast failures. Header brand icon "C" on amber `#d48c2b` (2.77:1) is a logotype and excluded from meaningful body/UI text audit. `rgba(255,255,255,0.9)` nav link on `#1a2744` (alpha-composited to approximately `#e8e9ec`, 12.2:1 ✓) and `rgba(255,255,255,0.6)` script-toggle on `#1a2744` (alpha-composited to approximately `#a3a9b4`, 6.26:1 ✓) both pass WCAG AA | The static prototype cannot demonstrate announcement timing, focus movement, or keyboard state transitions end to end | Production contracts must define announcement timing, focus handling, and keyboard state transitions | none observed |
| Dark-mode readiness | 5 | 1 | All colours hardcoded light-mode hex values (`lines 27-53`) | No semantic light/dark token layer or reviewable dark-theme palette is present; all prototype colours are defined as light-only values | No dark-theme evidence exists, so dark-theme contrast cannot be verified | Semantic light/dark token values and selector ownership remain to be frozen by #61/#62 |
| Implementation feasibility | 5 | 4 | Pure CSS custom properties; no JS dependency; standard CSS grid and flexbox | Two-column `grid-template-columns: 300px 1fr` layout with sticky route panel (`lines 835-849`) requires more CSS complexity and template markup than A or B; station/route system adds maintenance surface for future lessons | none observed | two-column grid, sticky sidebar, and station system increase maintenance surface for future lessons |
| **Total** | **100** | **87** | | | | |

Subtotal: 18 + 18 + 14 + 14 + 9 + 9 + 1 + 4 = **87** ✓

## Verification

- All three candidates scored in all eight categories. ✓
- Every category scoring row includes a Weakness, Accessibility risk, and
  Implementation risk field. Every Weakness is either a concrete observation or
  `none observed`. ✓
- No category score exceeds its weight. ✓
- All subtotals mathematically correct. ✓
- Rubric weight total: 20 + 20 + 15 + 15 + 10 + 10 + 5 + 5 = 100. ✓
- Refinements are 0–3 (here 2) and individually bounded. ✓

## Winner

**Direction C: Taiwan City Exploration — 87/100**

Tie rule invoked: Direction A (87) and Direction C (87) tied.

Per the fixed tie rule (Issue #60): "if totals tie, select the candidate with the
higher accessibility-category score." Direction C (9) has the higher accessibility
score over Direction A (7). Direction C is selected.

Direction B (84) was not in the tie.

### Why Direction A lost despite tying on total

Direction A tied with C at 87/100 but lost on the first tiebreaker: accessibility
score (A: 7, C: 9). A comprehensive contrast audit (WCAG 2.1 relative luminance
formula applied to effective rendered colours from HTML CSS declarations) revealed
4 normal-text contrast failures:

- Section alternate badge: white `#ffffff` on terracotta `#d4764a` (0.75rem,
  `section-heading__number` with `background: var(--color-accent-warm)`)
  3.24:1
- Status pill: accent `#b8432f` on blush `#e8d5cc` (0.75rem,
  `path-row__status` with `background: var(--color-accent-soft)`) 3.82:1
- Incorrect feedback correct-answer: `#4a7c59` on error-bg `#f7edec`
  (0.875rem, `feedback__correct-answer`) 4.23:1
- Pending status: `#736b64` on `#f0eae4` (0.75rem,
  `path-row__status--pending`) 4.38:1

Direction A lost because its current reviewed prototype contains four normal-text
contrast failures. Potential future palette corrections were not applied during
scoring.

### Why Direction B was rejected

Direction B scored 84/100 — the lowest of three. Its brand distinctiveness
(11/15) is the weakest area: a polished learning-app aesthetic that does not
specifically evoke the "travel guide" product trait from the brief. Chinese and
Japanese share the same sans-serif font family, reducing the visual
differentiation that helps the "Chinese-first" hierarchy. These shortcomings
are inherent to B's design concept and cannot be resolved through bounded
refinements.

### Tie-breaking rule application

Totals: A = 87, C = 87. Tie-rule step 1: "select the candidate with the higher
accessibility-category score" → C (9) > A (7). Winner determined at step 1.
Steps 2 (lower implementation risk) and 3 (human decision) were not reached.

## Bounded Refinements (2, non-hybrid)

### Refinement 1: Carry Direction C's semantic landmark patterns into production contracts

- **Source:** Direction C's `aria-current="step"`, `aria-live="polite"` on
  feedback, `aria-labelledby` on sections, `aria-label` on navigation elements
  (`direction-c-city-exploration.html:938, 949, 954, 985, 995, 1018, 1030,
  1035, 1050, 1056, 1074, 1081`).
- **Affected contracts (to be frozen by #61):** active lesson indicators,
  quiz feedback regions, lesson and vocabulary section labelling, primary and
  lesson navigation.
- **Non-hybrid justification:** Semantic HTML and ARIA attributes are standard
  accessibility enhancements, not visual design choices. They do not change C's
  palette, typography, layout, or wayfinding character.

### Refinement 2: Define semantic light/dark CSS custom property contract

- **Source:** Directions A, B, and C each define hardcoded light-only colour
  values in their prototype `:root` blocks and provide no `data-theme` token
  layer.
- **Affected interface:** Global `:root` CSS custom properties — restructure
  from flat light-mode hex values to a semantic light/dark token contract
  compatible with `<html data-theme="light|dark">`. Direction C's indigo/amber
  palette values are the light-mode base tokens; dark-mode values maintain WCAG
  AA contrast against dark backgrounds. OS preference resolution belongs to #54.
  Token application must remain compatible with `<html data-theme="light|dark">`
  and must not depend solely on `prefers-color-scheme`. Exact selectors, token
  names, and values are frozen by #61/#62.
- **Non-hybrid justification:** Semantic token layering is a technical foundation
  concern, not a visual direction attribute. All three directions share this
  gap; resolving it does not adopt any other direction's palette, typography,
  or layout decisions. Direction C's indigo/amber palette values remain the
  sole light-mode base.

## Arithmetic Recheck

| Direction | Calculation | Total |
|---|---|---|
| A | 18 + 18 + 14 + 15 + 9 + 7 + 1 + 5 | **87** |
| B | 18 + 17 + 14 + 11 + 9 + 9 + 1 + 5 | **84** |
| C | 18 + 18 + 14 + 14 + 9 + 9 + 1 + 4 | **87** |

All totals verified. ✓ Tie rule applied. Winner: Direction C (accessibility
score 9 > 7). ✓
