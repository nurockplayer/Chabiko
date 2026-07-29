# Issue #162 production journey evidence

All screenshots show the production home or lesson routes from the committed
Direction C implementation. They were captured from the static production build
at implementation commit `e17eb79220d3012ecc9683c5355e76e1ed5502a8`.

## Capture environment

- Capture browser: Codex In-app Browser (engine version is not exposed by
  the browser control surface)
- Cross-check browser: Google Chrome `150.0.7871.186`
- Browser control plugin: `26.721.41059`
- Node.js: `v24.15.0`
- pnpm: `10.33.0`
- Astro: `7.1.3`
- Screenshot setting: `fullPage: false`

The browser plugin reserves its own 15×32 px mobile chrome and 15×9 px desktop
chrome. Mobile captures therefore used a 405×876 browser override to produce a
390×844 drawable page viewport; desktop used 1455×909 to produce 1440×900.
The recorded viewport and PNG dimensions below are the resulting drawable page
viewport. `documentElement.clientWidth` matched 390 or 1440 respectively.

## Evidence index

| Evidence | Route | State | Theme | Viewport | Scroll Y | fullPage | PNG dimensions |
|---|---|---|---|---:|---:|---|---:|
| `home-mobile-390x844.png` | `/` | Fresh journey; lesson 1 current | light | 390×844 | 0 | false | 390×844 |
| `home-desktop-1440x900.png` | `/` | Fresh journey; all three route cards visible | light | 1440×900 | 0 | false | 1440×900 |
| `lesson-mobile-390x844.png` | `/lessons/lesson-001/` | Reading; intro aligned near top | light | 390×844 | 458.5 | false | 390×844 |
| `lesson-desktop-1440x900.png` | `/lessons/lesson-001/` | Reading; route sidebar and core expression | light | 1440×900 | 0 | false | 1440×900 |
| `practice-unanswered-mobile-390x844.png` | `/lessons/lesson-001/` | Question 1; no answer selected | light | 390×844 | 2666 | false | 390×844 |
| `practice-unanswered-desktop-1440x900.png` | `/lessons/lesson-001/` | Question 1; no answer selected | light | 1440×900 | 2146.5 | false | 1440×900 |
| `practice-incorrect-mobile-390x844.png` | `/lessons/lesson-001/` | Selected `これはいくらですか`; incorrect feedback before retry | light | 390×844 | 2686 | false | 390×844 |
| `practice-incorrect-desktop-1440x900.png` | `/lessons/lesson-001/` | Selected `これはいくらですか`; incorrect feedback before retry | light | 1440×900 | 2158.5 | false | 1440×900 |
| `practice-complete-mobile-390x844.png` | `/lessons/lesson-001/` | Retry reset, correct answer, then completion transition | light | 390×844 | 2662 | false | 390×844 |
| `practice-complete-desktop-1440x900.png` | `/lessons/lesson-001/` | Retry reset, correct answer, then completion transition | light | 1440×900 | 2085 | false | 1440×900 |
| `dark-home-mobile-390x844.png` | `/` | Fresh journey; lesson 1 current | dark | 390×844 | 0 | false | 390×844 |
| `dark-lesson-mobile-390x844.png` | `/lessons/lesson-001/` | Reading; route hierarchy and lesson intro | dark | 390×844 | 0 | false | 390×844 |
| `dark-practice-feedback-mobile-390x844.png` | `/lessons/lesson-001/` | Selected `これはいくらですか`; incorrect icon, label, answer and retry state visible | dark | 390×844 | 2649 | false | 390×844 |
| `dark-completion-mobile-390x844.png` | `/lessons/lesson-001/` | Retry reset, correct answer, 1200 ms completion transition finished | dark | 390×844 | 2615 | false | 390×844 |
| `dark-home-desktop-1440x900.png` | `/` | Fresh journey; all three route cards visible | dark | 1440×900 | 0 | false | 1440×900 |

## Browser checks

- Light and dark home plus lesson/practice were checked at 320, 375, 390,
  768, and 1440 CSS-pixel widths.
- `documentElement.scrollWidth` never exceeded `clientWidth`; header, home
  navigation, theme toggle, script slot, lesson navigation, and practice
  controls remained inside the drawable viewport.
- The theme control is a native button with an updated Japanese accessible
  name, `aria-pressed`, a visible focus outline, and a minimum 44 px target.
- Document language remained `ja`; target Chinese remained `zh-Hant`; pinyin
  remained `zh-Latn`. Long Chinese, pinyin, and Japanese strings wrapped
  without clipping.
- Correct, incorrect, and completion states retain icon, text, border, and
  accessible-name cues in addition to colour.
- The browser console had no warnings or errors during final production-build
  capture.
