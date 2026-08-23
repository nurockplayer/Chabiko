# Issue #424 affordance evidence — Home + shared Header

These captures come from the production Astro build (`pnpm build` followed by
`pnpm preview`), not a prototype. They document the bounded A1 Editorial Calm
reference implementation: controls and available course rows are discernible
at rest, while passive editorial content remains flat.

## Capture environment

- Route: `/`
- Browser: Playwright Chromium, headless
- Themes: `chabiko_theme` light and dark preference
- Viewports: 320×844, 390×844, and 1440×1000
- Progress state: the normal fresh state, plus a valid v1 basic-vocabulary
  progress record (`learned`, `knownStreak: 2`) for continuation

## Evidence index

| Evidence | State proved |
| --- | --- |
| `home-fresh-light-320.png` | Fresh, light, narrow mobile; 320px has no horizontal overflow. |
| `home-fresh-dark-390.png` | Fresh, dark, mobile. |
| `home-fresh-light-desktop.png` | Fresh, light, desktop. |
| `home-continuation-light-390.png` | Hydrated continuation state: `単語学習を続ける`, `1 / 1582 語学習済み`, `学習中`. |
| `home-available-hover-light-390.png` | Available row hover surface and jade boundary. |
| `home-available-pressed-light-390.png` | Available row pressed state. |
| `home-header-keyboard-focus-dark-390.png` | Keyboard Tab focus on the bounded shared Header theme control. |
| `home-primary-keyboard-focus-light-390.png` | Keyboard Tab focus on the primary continuation CTA. |
| `home-row-keyboard-focus-light-390.png` | Keyboard Tab focus on an available course row. |
| `home-unavailable-light-390.png` | Unavailable HSK row: rendered as a `div`, no trailing arrow, default cursor, no false action affordance. |

## Unavailable-row fixture provenance

The production dataset currently exposes all three courses, so the unavailable
capture was rebuilt from `217ac5de` with only the HSK Dashboard payload made
empty. This exercised the same production SSR branch that renders an
unavailable course as a non-link; the temporary `dashboardPayload.ts` mutation
was restored before the final normal `pnpm build`. It is not a new runtime mode
or committed content change.

`manifest.json` records the capture method, runtime assertions, image
dimensions, source commit, and SHA-256 checksum. The current capture is
`home-unavailable-light-390.png` with SHA-256
`a5ecbe7fe609309dd5f17fbb629e957780e28d5e4102e4eaa379fce7fe40e406`.

## Observed browser assertions

- At 320, 390, and 1440px: `scrollWidth === clientWidth`.
- The primary CTA is a 44px filled coral control; available rows carry a
  restrained paper surface, 1px boundary, semantic radius, and persistent
  bordered arrow affordance.
- Hover changes the available row to jade-boundary/paper surface; pressed state
  adds the jade-soft arrow surface.
- Keyboard focus is visibly persistent: Header control 2px coral focus ring;
  primary CTA and available row 3px jade focus rings.
