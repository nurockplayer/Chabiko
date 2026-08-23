# Issue #389 reference-family evidence — Direction A1 Editorial Calm

All screenshots are captured from the three standalone reference prototypes in
`docs/design/prototypes/reference-family-389/`:

| Page | Prototype | Role |
| --- | --- | --- |
| 01 Home | `01-home.html` | `今日の学習` / daily-learning home |
| 02 先生厳選単語 Study | `02-teacher-vocab-study.html` | vocabulary session / reveal surface |
| 03 台湾旅行 Lesson | `03-taiwan-lesson.html` | lesson reading surface |

The three screens share one visual grammar (`grammar.md` in the prototype
directory) and were reviewed together as a reference family. This issue freezes
that grammar as the repository canonical visual contract; see
`docs/design/reference-family-389.md`.

## Capture environment

- Source: standalone HTML prototypes (reference only; not the production build)
- Base viewport: mobile 390×844; narrow mobile 320×375; desktop 1024px+
  representative with the prototype's `@media (width >= 1024px)` rules
- Themes: light and dark (`prefers-color-scheme: dark` token swap)
- `comparison.html` renders all three pages side by side for family review
- Screenshot format: PNG full-page captures

## Evidence index

| Evidence | Page | Theme | Viewport |
| --- | --- | --- | --- |
| `home-mobile-light.png` | Home | light | 390px mobile |
| `home-mobile-dark.png` | Home | dark | 390px mobile |
| `home-mobile-320.png` | Home | light | 320px narrow mobile |
| `home-desktop-light.png` | Home | light | desktop representative |
| `home-desktop-dark.png` | Home | dark | desktop representative |
| `vocabulary-study-mobile-light.png` | 先生厳選単語 | light | 390px mobile |
| `vocabulary-study-mobile-dark.png` | 先生厳選単語 | dark | 390px mobile |
| `vocabulary-study-mobile-320.png` | 先生厳選単語 | light | 320px narrow mobile |
| `vocabulary-study-desktop-light.png` | 先生厳選単語 | light | desktop representative |
| `vocabulary-study-desktop-dark.png` | 先生厳選単語 | dark | desktop representative |
| `lesson-mobile-light.png` | 台湾旅行 | light | 390px mobile |
| `lesson-mobile-dark.png` | 台湾旅行 | dark | 390px mobile |
| `lesson-mobile-320.png` | 台湾旅行 | light | 320px narrow mobile |
| `lesson-desktop-light.png` | 台湾旅行 | light | desktop representative |
| `lesson-desktop-dark.png` | 台湾旅行 | dark | desktop representative |

## Narrow-mobile validation

Per `grammar.md` section 10, all three pages were validated at 320px with
Playwright: `scrollWidth == clientWidth == 320` on each page (no horizontal
overflow). Narrow-mobile behavior applies at `<= 374px`: `.app` width 100%,
horizontal padding 28px → 20px, core Chinese sentence 46px → 40px, page title
30–33px → 28–30px, and flashcard illustration 180px → 150px.

## Visual-review provenance

This reference family is the approved output of the Issue #389 design-first
gate. It was reviewed as one family (Home + 先生厳選単語 Study + 台湾旅行
Lesson) in light and dark across mobile and desktop, and satisfies the Issue
#389 visual-direction gate (art-direction statement and eight design
principles in the issue body). The frozen tokens are recorded in
`docs/design/reference-family-389.md`; the prototype HTML in
`docs/design/prototypes/reference-family-389/` remains as reproducible source
for the screenshots.

## Non-blocking follow-up

The 先生厳選単語 illustration assets (`teacher-core-v1` webp) are a
black-background textbook-cartoon pack that does not natively match the
A1 Editorial Calm warm-paper editorial language. In the reference, the artwork
is placed as supporting material below the Chinese text (mobile 180px / desktop
220px / 320px 150px) to reduce the conflict. The artwork-style resolution itself
is a non-blocking follow-up, not part of this freeze.
