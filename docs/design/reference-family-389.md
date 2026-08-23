# Chabiko Frozen Reference Family — Direction A1 Editorial Calm (Issue #389)

> **Status: FROZEN CURRENT CONTRACT.** This document is the canonical visual
> contract for Chabiko's learner-facing UI. It freezes the approved A1 Editorial
> Calm reference family (Home / 先生厳選単語 Study / 台湾旅行 Lesson) reviewed
> under Issue #389.
>
> The frozen values are now deployed through the shared A1 foundation (#393)
> and the completed Home / 先生厳選単語 / 台湾旅行 / auxiliary propagation wave
> (#394–#397), including the first cross-surface audit fixes (#405–#408).
> `token-contract.json` records the deployed token/compatibility state. The HSK
> product lane still has its own truthful release/integration gates (#81 → #267
> → #377 → #375), so this status must not be read as declaring those open HSK
> issues complete.
>
> Art direction: **Japanese editorial learning × Taiwan travel warmth** —
> Japanese editorial/study-notebook calm with a restrained Taiwan travel
> atmosphere. Expressed as a consumer learning app, not an LMS/SaaS dashboard
> and not a generic AI pastel-card UI.

## Supersession

- This document **supersedes `docs/design/approved-direction.md` (Direction C:
  Taiwan City Exploration) as the canonical learner-facing visual direction**.
- Direction C's former production contract in `docs/design/design-contract.md`
  remains valid as historical implementation evidence and must not be deleted;
  it is no longer the current learner-facing production contract.
- The old universal `4px` micro-radius aesthetic lock (Issue #365/#366) is
  superseded by the semantic radius scale in §5 below.
- Production behavior, IA, and architecture invariants from #365/#371 are
  preserved and not reopened (see §12).

## Reference evidence

- Reference prototypes: `docs/design/prototypes/reference-family-389/`
  (`01-home.html`, `02-teacher-vocab-study.html`, `03-taiwan-lesson.html`,
  `comparison.html`, `grammar.md`).
- Committed screenshots: `docs/design/evidence/issue-389/` (15 PNGs — three
  pages × light/dark mobile, light/dark desktop, and a 320px narrow-mobile
  light capture; index and provenance in `evidence/issue-389/README.md`).
- The prototype HTML comments still carry an exploratory "not frozen" note; this
  document is the freeze and overrides that annotation.

---

## 1. Color — light palette (frozen)

Neutral-dominant. Jade/coral are restrained brand and accent families.

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Page | `--paper` | `#FAF8F4` | Warm off-white page background |
| Soft surface | `--paper-deep` | `#F4F0E9` | Soft block surfaces (can-do, flashcard base) |
| Primary text | `--ink` | `#272522` | Body and headings |
| Secondary text | `--ink-secondary` | `#5E5A53` | Descriptions and supporting text |
| Muted text | `--ink-muted` | `#736C66` | Pinyin and metadata |
| Hairline | `--hairline` | `#E6E1D8` | Row separators |
| Strong hairline | `--hairline-strong` | `#D6D0C5` | Track-nav and input borders |
| Jade (brand) | `--jade` | `#536B62` | Brand and learning state |
| Jade as text | `--jade-ink` | `#3E554D` | Jade-colored text |
| Jade soft | `--jade-soft` | `#E7ECE8` | Very light jade support surface |
| Coral (accent) | `--coral` | `#E87961` | Editorial / "now here" accent |
| Coral deep | `--coral-deep` | `#B84C38` | Coral-colored text |
| Coral soft | `--coral-soft` | `#F6E6E1` | Very light coral support surface |

## 2. Color — dark palette (frozen)

Same token names and hierarchy; only values switch. The dark mode does not
invent a new UI.

| Role | Token | Value | Note |
| --- | --- | --- | --- |
| Page | `--paper` | `#1E1C19` | Deep warm charcoal |
| Soft surface | `--paper-deep` | `#2A2723` | Slightly brighter soft block |
| Primary text | `--ink` | `#EFE9E0` | Warm white |
| Secondary text | `--ink-secondary` | `#C6BFB4` | |
| Muted text | `--ink-muted` | `#A29A8E` | Pinyin/meta; WCAG AA retained |
| Hairline | `--hairline` | `#3A352D` | |
| Strong hairline | `--hairline-strong` | `#4C463D` | |
| Jade | `--jade` | `#7FA093` | Brand / state |
| Jade as text | `--jade-ink` | `#A5C0B5` | Brightened for use as text |
| Jade soft | `--jade-soft` | `#27302B` | Deep soft surface |
| Coral | `--coral` | `#F09380` | |
| Coral deep | `--coral-deep` | `#EB8D74` | Brightened for use as text |
| Coral soft | `--coral-soft` | `#352621` | Deep soft surface |

Studio backdrop outside the app frame: `#14120F` (dark) / warm gray chrome in
light. On desktop representative (>= 1024px) the page background is `--paper`.

### Solid-button rule (dark)

Because `--jade-ink` / `--coral-deep` brighten in dark mode, white text on them
loses contrast. A solid brand button in dark mode must use the darker value as
its background and `--ink` (dark `#EFE9E0`) or another high-contrast dark text
as its foreground, verified against WCAG AA. This rule is frozen; exact
component values are validated during production propagation.

## 3. Typography — roles (frozen)

Font stacks (system-first, Japanese-market baseline):

| Family | Token | Stack |
| --- | --- | --- |
| Japanese UI / body | `--font-sans` | `"Hiragino Sans", "Noto Sans JP", "Helvetica Neue", Arial, sans-serif` |
| Japanese editorial heading | `--font-serif-ja` | `"Hiragino Mincho ProN", "Yu Mincho", serif` |
| Chinese learning text | `--font-serif-zh` | `"Songti TC", "Songti SC", "Hiragino Mincho ProN", serif` |

Japanese UI/body text is the visual baseline rhythm. Chinese is the learning
target (deliberate serif role); pinyin is auxiliary. Heading weight is `700`.

| Role | Family | Mobile | ≤374px | Line-height | Notes |
| --- | --- | --- | --- | --- | --- |
| Japanese body / UI | sans | 12–14px | same | 1.7–1.8 | |
| Japanese page title | serif-ja | 28–33px | 28–30px | 1.25–1.3 | Home `今日の学習` is the 33px exception |
| Japanese section heading | serif-ja | 16–19px | 18px | — | |
| Chinese core sentence | serif-zh | 46px | 40px | 1.25 | Lesson desktop representative: 50px |
| Chinese flashcard word | serif-zh | 52px | 44px | 1.2 | 先生厳選単語 Study revealed word (desktop representative: 56px) |
| Chinese body / example / chunk | serif-zh | 21–22px | 19px (chunk) | 1.25–1.4 | |
| Pinyin | sans | 12.5–14px | same | — | `--ink-muted`, clearly legible |
| Small label | sans | 10–11.5px | same | — | tracking 0.12–0.16em |

Rules:

- Chinese (Traditional/Simplified) and pinyin always carry `lang="zh-Hant"` /
  `lang="zh-Hans"` / `lang="zh-Latn"`.
- Page titles are not "hero" typography; only Home `今日の学習` reaches 33px.
- No compressed Japanese copy to force layout fit; no gratuitous letter spacing
  on normal Japanese text.
- Long Japanese/Chinese wraps naturally (`overflow-wrap` allowed); at 320px the
  core sentence drops to 40px to avoid unnatural word breaks.
- The learner hierarchy is Chinese → pinyin → Japanese, applied consistently
  across surfaces, not decorative consistency.

## 4. Spacing — 8px family (frozen)

| Token | Value | Usage |
| --- | --- | --- |
| `--sp-1` | 4px | Inline / between elements |
| `--sp-2` | 8px | Inline / between elements |
| `--sp-3` | 12px | Between elements |
| `--sp-4` | 16px | Between elements |
| `--sp-5` | 20px | Between elements / inside cards |
| `--sp-6` | 24px | Between elements / inside cards |
| `--sp-7` | 28px | Between elements |
| `--sp-8` | 32px | Section spacing / around headings |
| `--sp-10` | 40px | Section spacing |
| `--sp-12` | 48px | Section spacing |

- Mobile horizontal page padding: **28px** (20px at 320–374px).
- Section spacing is approximately **40px**.
- Whitespace is a grouping tool; do not apply equal padding to every object
  regardless of importance.
- Desktop representative max content width: **Home 880px / Study 720px /
  Lesson 760px** (mobile base is fluid, not fixed).

## 5. Radius — semantic scale (frozen)

Supersedes the universal `4px` aesthetic lock. Few, semantic, documented.

| Token | Value | Usage |
| --- | --- | --- |
| `--radius-chip` | 6px | Small chips |
| `--radius-control` | 8px | Buttons / inputs |
| `--radius-content` | 10px | Soft blocks (can-do, travel task, small imagery) |
| `--radius-card` | 12px | Genuine object cards (flashcard) |
| `--radius-hero` | 16px | Exceptional hero / editorial surface |
| `50%` | circle | Brand mark and true dots only |

Do not scatter arbitrary radii or swing to 20–32px generic AI-card rounding.

## 6. Surface / card rules (frozen)

- **Do not solve hierarchy with a card.** Prefer whitespace, typography,
  hairlines, section backgrounds, and editorial composition.
- A bordered/elevated card is allowed only when the content is genuinely one
  interactive/object-like unit. In this reference family the flashcard is the
  only genuine object card.
- Hairlines are bottom-only rows by default; section headings carry a strong
  `--ink` 1px underline only on the Home typographic index.
- Soft block surfaces: `--paper-deep` for can-do and flashcard base;
  `--coral-soft` for the travel task; `--jade-soft` for jade-support blocks.
- No nested card-on-card layouts.

### Interaction-affordance clarification (Issue #424)

Editorial restraint must not erase interaction affordance. The hierarchy is
semantic, not a reason to make a real action read like passive copy:

- A page has one local primary action when needed: a clearly filled control
  using the existing accent and `--radius-control`.
- Secondary actions may use an outlined or soft bounded control with a complete
  hit area.
- An available interactive row/object link may use a restrained 1px boundary,
  `--paper`/`--paper-deep` surface, semantic radius, and a persistent trailing
  affordance. This is interaction clarity, not a competing card hierarchy.
- Passive headings, descriptions, labels, and metadata stay flat editorial
  content; they do not acquire action framing merely for visual symmetry.
- An unavailable state must be unmistakably non-interactive: no link target,
  no pointer/hover treatment, and no trailing action affordance.

## 7. Coral / jade semantics (frozen)

- **jade = learning state / brand.** Active, complete, can-do, status labels,
  track-local nav active underline, achievement check marks.
- **coral = editorial accent / "now here".** Continuation (`続きから`), core
  expression top line, track numbering, lesson label, travel-task block.
- Each page uses **one primary accent** (jade or coral is dominant): Home and
  Lesson are coral-primary; 先生厳選単語 Study is jade-primary.
- The role split is identical in light and dark.

## 8. Breadcrumb and track-local navigation (frozen)

- **Breadcrumb:** small muted typography (11px, `--ink-muted`), no container
  box, `›` separators, current location is text (non-link). Semantics and
  accessibility from #366 are preserved; visually demoted so learning content
  leads.
- **Track-local nav:** a bottom-hairline row with a 2px jade underline on the
  active item (`aria-current`). Feels native to the surface, not a global tab
  bar.

## 9. Illustration hierarchy (frozen)

- **先生厳選単語:** the `teacher-core-v1` illustration is **supporting
  material for the answer**, placed smaller below the Chinese word (mobile
  180px / desktop 220px / ≤374px 150px max-width). It is never a hero. Before
  reveal, only the simplified Chinese word is shown with no image (reveal
  contract preserved).
- **台湾旅行:** no hero illustration. Taiwan warmth is expressed through
  `--coral-soft` editorial blocks and copy.
- **Home:** no illustration; typography + hairlines carry the page.
- No mascot on every section, no confetti/reward spam, no emoji-as-product
  shortcut.

## 10. Responsive rules (frozen)

- Mobile-first; 390px is the base. Dark mode switches tokens only
  (`prefers-color-scheme: dark` in the reference), never the hierarchy.
- **<= 374px (narrow mobile):** `.app` width 100%; horizontal padding 28px →
  20px; core Chinese sentence 46px → 40px; flashcard word 52px → 44px; page
  title 28–33px → 28–30px; flashcard illustration 180px → 150px.
- **>= 1024px (desktop representative):** page background is `--paper`;
  max content width per §4; core sentence 46px → 50px (Lesson).
- No horizontal overflow at 320, 375, 390, 768, 1024, or 1440px (validated at
  320px for all three reference pages).
- Practical interactive targets >= 44×44 CSS px where applicable; visible
  `:focus-visible`; logical keyboard order; respect `prefers-reduced-motion`.
- WCAG 2.1 AA contrast for text and meaningful states in both themes.

## 11. Three-track micro-personality (frozen)

One design system, one brand, three restrained moods:

- **先生厳選単語:** private study-notebook / teacher-curated feeling. Subtle
  paper/bookmark/annotation cues are allowed without literally simulating a
  notebook. Jade-primary.
- **HSK:** the most systematic track — clean, ordered, progress-readable; must
  not become exam-admin software.
- **台湾旅行:** warmest/editorial track — scenarios, places, travel warmth may
  carry more emotional weight; muted jade/coral can be slightly more present.
  Avoid tourist-brochure clichés.

Shared typography, navigation, spacing, controls, accessibility, and token
architecture remain consistent across all three.

## 12. Preserved architecture invariants

This visual freeze does not change or reinterpret:

- learning-track identity and hierarchy (exactly three first-class tracks);
- `/` as learner Home / Dashboard architecture;
- progress stores, progress semantics, and cross-track snapshot behavior;
- achievements domain / evaluation (#372/#373 evidence semantics);
- lesson completion / practice behavior;
- vocabulary reveal / rating / requeue / answer-secrecy / account-sync behavior;
- HSK pool / session / progress / availability behavior;
- script-preference bootstrap / provenance / storage
  (`chabiko.script-preference.v1`);
- tone / word-order state machines;
- route URLs except explicitly approved assessment routes;
- teacher-review / auth / security behavior;
- content schemas / loaders unless presentation data already exposed is used
  unchanged.

## 13. Freeze decisions resolved from the reference exploration

These items were left open during reference exploration and are now frozen by
this document:

- Dark palette final values (§2).
- Dark solid-button contrast rule (§2).
- `--paper-deep` dark `#2A2723` is accepted as a sufficiently distinct soft
  block surface.
- Chinese core sentence 46px (40px at 320px).
- 先生厳選単語 flashcard word 52px (44px at 320px, 56px desktop representative).
- serif-ja heading weight: 700 single weight.
- Pinyin muted level `#736C66` / dark `#A29A8E` retained.
- System-font fallbacks: Hiragino → Yu Mincho / Songti / Noto / Arial.
- Desktop representative max widths: Home 880 / Study 720 / Lesson 760px.
- Section spacing token `--sp-10` (40px).
- Narrow-mobile padding 20px and core sentence 40px.
- Flashcard revealed transition follows the production reveal contract
  (simplified Chinese only before reveal; answer + illustration after).
- Self-rating labels: また / むずかしい / できた.
- serif-zh fallback: Songti TC / Songti SC.

## 14. Non-blocking follow-up

**Teacher vocabulary artwork-style mismatch.** The `teacher-core-v1`
illustration pack (500×500 webp, black-background flat-color textbook cartoon)
does not share the A1 Editorial Calm warm-paper editorial language. The
reference mitigates this by placement (supporting, below the Chinese word), but
the style mismatch itself is not resolved here. This is a non-blocking
follow-up; do not redraw artwork in this freeze round. Options for a future
issue: adopt the current pack as "textbook-style supporting figure", replace it
with a thin-line warm-paper-style set, or go text-first without illustration.

## 15. Relationship to current production

A1 is no longer an undeployed prototype target. The shared semantic token,
typography, shell, Header, breadcrumb, and TrackNav foundation shipped in #393.
Home, 先生厳選単語, 台湾旅行, and the shipped auxiliary learner surfaces were
then propagated through #394–#397. The first complete visual audit identified
four bounded implementation findings, all resolved by #405–#408.

The remaining distinction is product-lane completion, not a competing visual
direction:

- **Current contract:** the A1 values and rules in this document.
- **Deployed non-HSK surfaces:** #393 and #394–#397, with #405–#408 audit fixes.
- **HSK:** may consume the shared A1 foundation, but full HSK release, visual
  integration, and scored tests remain truthfully gated by #81 → #267 → #377
  → #375. Do not mark those open issues complete from this document.
- **Legacy aliases:** may remain only as the compatibility layer documented in
  `token-contract.json`; they are not a second design system and must not be
  used to resurrect Direction C as the target.

Final cross-surface convergence remains tracked by #398 after the HSK lane is
production-complete.
