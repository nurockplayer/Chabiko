# V2 consumer reference browser evidence

Captured on 2026-08-24 from the built `/v2-reference/` route with the repository-pinned Playwright Chromium 1.61.1 Linux image, DPR 1, `ja-JP`, reduced motion, and the bundled Noto Sans JP font.

## Viewports and states

Both 375×812 and 390×844 sets contain, in order:

1. `今日`;
2. focused Taiwan learning;
3. answer-hidden retrieval;
4. repair after wrong order → hint → explicit reveal;
5. result after retrying and rebuilding the correct order.

Contact sheets:

- `flow-contact-sheet-375.png`
- `flow-contact-sheet-390.png`

The individual PNG files retain the exact viewport dimensions.

`tests/visual/v2-reference.visual.spec.ts` reproduces the complete flow and compares all ten state/viewport combinations against committed, zero-tolerance pixel baselines. It also fails on external requests, browser runtime errors, horizontal overflow, or an answer request before explicit reveal.

## Interaction evidence

`tests/a11y/v2-reference.a11y.spec.ts` verifies the live built flow rather than static screenshots:

- 320×800, 375×812, and 390×844 run the complete learning → retrieval → repair → hint → reveal → retry → correct → result flow with no horizontal overflow, undersized controls, or partially clipped visible controls at any state;
- the 390×844 keyboard case activates the initial CTA and progressive-support disclosure with `Enter`; later native-button transitions assert managed focus at each new screen;
- global navigation is absent from the focused learning flow;
- the answer and pinyin are absent from rendered page text through retrieval, incorrect, and hint states;
- the answer artifact is not requested until the explicit reveal action;
- serious and critical axe findings are empty across the major 390×844 states;
- request, console-error, and page-error listeners remain clean across every full-flow viewport run.

The scene image is an AI-generated, reference-only asset. Its generator, transformation, rights status, and allowed-use metadata are stored in `data/v2-reference/lesson-001.json`.
