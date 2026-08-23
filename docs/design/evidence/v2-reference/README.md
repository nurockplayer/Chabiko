# V2 consumer reference browser evidence

Captured on 2026-08-23 from the built `/v2-reference/` route with Playwright Chromium 1.61.1, DPR 1, `ja-JP`, and reduced motion.

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

## Interaction evidence

`tests/a11y/v2-reference.a11y.spec.ts` verifies the live built flow rather than static screenshots:

- 320×800, 375×812, and 390×844 have no horizontal overflow, undersized controls, or partially clipped visible controls;
- learning, retrieval, repair, reveal, retry, correct, and result transitions are keyboard-operable with managed focus;
- global navigation is absent from the focused learning flow;
- the answer and pinyin are absent from rendered page text through retrieval, incorrect, and hint states;
- the answer artifact is not requested until the explicit reveal action;
- serious and critical axe findings are empty across the major states;
- no external request, console error, or page error occurs during capture.

The scene image is an AI-generated, reference-only asset. Its generator, transformation, rights status, and allowed-use metadata are stored in `data/v2-reference/lesson-001.json`.
