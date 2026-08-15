# Frontend Interaction and Browser Evidence Playbook

This playbook defines reusable JS-free frontend interaction patterns, browser-validation evidence, screenshot verification, and read-only arbiter boundaries. It is independent of any design Direction and does not bind selectors or learner-facing copy to a specific redesign.

Source: the post-merge retrospective for Issue #155, implementation/review history from PR #156, and the resolved Codex review threads. Incident-specific history remains in #155 and PR #156; this document preserves reusable rules only.

## 1. Native interaction decision table

A JS-free prototype must use native interaction patterns. Use the required pattern for each need:

| Need | Required pattern |
| --- | --- |
| reveal/hide toggle | `<details>` with `<summary>` |
| mutually exclusive options | native radio input with associated `<label>` |
| fragment-driven state | anchor with a real `#id` target plus `:target` |
| action without navigation | `<button type="button">` |
| state-dependent visible text | real child elements switched with CSS display |

Forbidden patterns:

- a focusable label or generic element used as a simulated button;
- static ARIA state used to imitate mutable native state;
- transparent or zero-size controls that remain in the keyboard tab sequence;
- `href="#"` used as an inert action;
- generated CSS content such as `::after` used as the only or primary accessible label;
- controls or states not required by the issue contract.

## 2. Required per-control behavior contract

Before implementation, freeze these properties for every interactive control:

- native element type;
- visible states;
- keyboard activation behavior;
- state or fragment transition, including expected hash changes;
- whether the control can trigger completion;
- expected browser-computed accessible name;
- screenshot state in which the control must appear.

Behavior that the specification does not describe is a contract gap, not permission for the implementer to invent a reasonable-looking behavior.

## 3. Browser evidence before arbiter review

Run browser smoke tests before read-only arbiter review and provide concrete evidence covering:

- Tab traversal has no invisible or zero-size focus stops;
- summary, radio, button, and anchor controls activate correctly from the keyboard;
- focus indicators are visible;
- where required, rendered interactive targets are at least 44 px;
- accessible names come from the browser accessibility tree or equivalent Playwright assertions;
- expected hash/state transitions and visibility changes occur;
- every contract viewport has no horizontal overflow.

`textContent`, `innerText`, DOM visibility, browser-computed accessible name, viewport inclusion, and PNG evidence are different signals and must not be substituted for one another.

## 4. Screenshot and viewport evidence

For every relevant capture, verify:

- the exact viewport and PNG IHDR dimensions;
- the issue-required `fullPage` state;
- expected reveal/completion/hash and scroll state;
- full viewport bounding boxes for every required evidence element;
- full viewport bounding boxes for every visible interactive control in the captured fragment, including controls omitted from a handwritten checklist;
- the committed PNG itself through visual inspection, not only a DOM-visibility proxy such as `checkVisibility()`.

## 5. Reviewer capability boundary

A Read/Grep/Glob-only arbiter can review code, contract, and supplied evidence, but it cannot independently establish:

- actual browser keyboard behavior;
- accessibility-tree output;
- viewport inclusion;
- pixel content of a committed PNG.

Therefore browser evidence must be produced before arbiter review and included in the review packet.

## 6. Review and merge rule

Final independent review may be performed by ChatGPT or Codex. When ChatGPT personally verifies all of the following:

- the latest reviewed head has not moved;
- latest CI succeeded;
- the full diff and changed-file scope match the issue;
- review findings and threads have been handled;
- no blocking finding remains;

ChatGPT may merge directly without an additional abstract controller gate. A more specific current issue or repository merge policy may still impose additional requirements such as a named reviewer, risk-tier signals, or a concurrency hold.

## 7. Worked example

The following compact, direction-independent example comes from the PR #156 remediation history.

- **Why focusable-label/hidden-input simulation failed:** a focusable `<label>` simulated a button, controlled a transparent zero-size checkbox/radio, and was overlaid with static ARIA state. Three failures followed: keyboard activation of the label did not reliably toggle its associated input; a hidden focusable input remained in the tab sequence without a visible focus target; static `aria-pressed` could not track real mutable state.
- **How native primitives replaced it:** reveal/hide moved to `<details>`/`<summary>`, exclusive options to native radio + label, completion to an anchor with a real `#id` plus `:target`, non-navigation actions to `<button type="button">`, and state-dependent text to real child elements switched with CSS display. The implementation removed simulated `role=button`, `tabindex`, and static `aria-pressed` state.
- **Why `checkVisibility()` could not prove screenshot inclusion:** a DOM-visibility proxy only reports whether an element is considered visible. It does not prove that the element is fully inside the viewport captured in the committed PNG. Full viewport bounding-box assertions plus visual inspection of the PNG are required.
- **Why non-contract controls increase the validation surface:** adding a control not required by contract makes it another element that must be verified and included in evidence. If a mobile capture clips it, the extra control creates a new blocking finding. Define a control in the per-control contract and validation matrix before adding it.
