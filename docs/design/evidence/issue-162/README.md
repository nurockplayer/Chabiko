# Issue #162 visual evidence

Production UI evidence for Direction C on the existing MVP learner journey.

## Capture environment

- Tool: OpenAI Browser plugin `26.721.41059` (in-app browser; engine version is not exposed)
- Date: 2026-07-29 (Asia/Tokyo)
- Base URL: `http://127.0.0.1:3002`
- Capture mode: viewport screenshot, `fullPage: false`
- Theme: light unless the state says dark
- Progress: clean local progress before the light home and lesson captures;
  lesson 1 is complete in the final dark-theme capture

The task's explicit delivery instruction requires both light and dark theme
presentation. That instruction overrides issue #162's light-only exclusion. The
dark presentation is CSS-only: it adds no preference persistence, storage key,
runtime listener, or page lifecycle behavior.

The browser reserves a small non-page strip at the bottom of its viewport capture.
The responsive layout was rendered at the requested CSS viewport dimensions; the
committed PNG dimensions below are the exact pixels returned by the browser.

## Captures

| File | Route and state | CSS viewport | Scroll Y | PNG dimensions |
| --- | --- | ---: | ---: | ---: |
| `home-mobile-390x844.png` | `/`, clean progress | 390 × 844 | 0 | 390 × 813 |
| `home-desktop-1440x900.png` | `/`, clean progress | 1440 × 900 | 0 | 1440 × 891 |
| `lesson-mobile-320x720.png` | `/lessons/lesson-001/`, reading start and 44 px route link | 320 × 720 | 0 | 320 × 688 |
| `lesson-mobile-390x844.png` | `/lessons/lesson-001/`, reading start | 390 × 844 | 0 | 390 × 813 |
| `lesson-tablet-768x1024.png` | `/lessons/lesson-001/`, tablet reading start | 768 × 1024 | 0 | 768 × 1004 |
| `lesson-desktop-1440x900.png` | `/lessons/lesson-001/`, reading start | 1440 × 900 | 0 | 1440 × 891 |
| `practice-unanswered-mobile-375x812.png` | `/lessons/lesson-001/`, unanswered with all choices visible | 375 × 812 | 1980 | 375 × 781 |
| `practice-unanswered-mobile-390x844.png` | `/lessons/lesson-001/`, unanswered with all choices visible | 390 × 844 | 1980 | 390 × 813 |
| `practice-incorrect-mobile-390x844.png` | `/lessons/lesson-001/`, wrong answer selected and feedback visible | 390 × 844 | 2175.5 | 390 × 813 |
| `practice-correct-mobile-390x844.png` | `/lessons/lesson-001/`, correct answer selected and feedback visible | 390 × 844 | 2123.5 | 390 × 813 |
| `practice-completion-mobile-390x844.png` | `/lessons/lesson-001/`, completed and completion region focused | 390 × 844 | 2044 | 390 × 813 |
| `lesson-dark-mobile-390x844.png` | `/lessons/lesson-001/`, completed lesson at reading start with dark theme | 390 × 844 | 0 | 390 × 813 |

Every captured viewport had `scrollWidth === clientWidth`.

## Additional responsive checks

- 320 × 720: home and lesson reading/navigation checked; the compact lesson
  route link computes to a 44 px height and `scrollWidth === clientWidth === 320`.
- 375 × 812: home and unanswered practice checked; all three answer controls
  are fully visible and `scrollWidth === clientWidth === 375`.
- 390 × 844: home, lesson, unanswered practice, both feedback states,
  completion, and dark presentation checked with no horizontal overflow.
- 768 × 1024: lesson reading/navigation checked; the route link remains 44 px
  high and `scrollWidth === clientWidth === 768`.
- 1440 × 900: home and lesson reading/navigation checked with no horizontal
  overflow.

## Deferred follow-ups

- Contract extraction remains separate from this integration work (#61).
- Screenshot regression automation remains separate (#70).
- Automated accessibility tooling remains separate (#71).
- Additional visual polish should be handled as a focused follow-up after this
  production journey lands; no new issue is created or closed here.
