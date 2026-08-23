# Chabiko Design Lab: Five Product Grammars

> Status: exploratory, prototype-only. These routes do not replace the frozen
> A1 Editorial Calm production contract in `docs/design/reference-family-389.md`.

## Design read

Mobile-first consumer learning for Japanese-speaking adults who need practical
Mandarin for Taiwan travel. The five prototypes keep one shared content and
interaction contract while changing typography, composition, density,
geometry, navigation, and progression grammar.

## Production audit

Current production is coherent A1 Editorial Calm: warm paper, Japanese and
Chinese serif roles, jade/coral semantics, editorial hairlines, restrained
object cards, and strong Chinese-first hierarchy. The main opportunity for
exploration is structural. Home, lesson, and travel content frequently share a
similar vertical editorial rhythm, while vocabulary is the only strongly
object-like learning surface.

The prototypes preserve these product strengths:

- Chinese target language leads pinyin, Japanese explanation, and chrome.
- Home exposes a clear continuation action and learning path.
- Vocabulary follows reveal, answer, and self-rating.
- Lesson follows hook, can-do, core sentence, chunks, bridge, sound, practice,
  and travel task.
- Travel readiness is scenario-based rather than streak-based.
- Controls remain keyboard accessible with practical 44px targets.

## Shared comparison contract

Every grammar renders the same four views from one structured fixture:

1. `home`: continuation plus Taiwan learning path.
2. `vocabulary`: the reviewed travel word `這個 / zhège / これ`.
3. `lesson`: Lesson 001 `我要這個` plus one practice question.
4. `travel`: the same readiness scenarios and two generated Taiwan photos.

Query parameter `view=home|vocabulary|lesson|travel` selects an identical
capture state. Interactive controls also switch views without navigation.
Unknown values fall back to `home`.

## Grammar 1: Apple-inspired premium restraint

Dial: `DESIGN_VARIANCE 7`, `MOTION_INTENSITY 5`, `VISUAL_DENSITY 2`.

- One dominant learning object per viewport. Home opens on the core Chinese
  phrase, not a track grid.
- Scale, optical centering, and large quiet zones create hierarchy; metadata is
  pushed to the edges.
- Navigation is an attached bottom rail, while the primary action is a single
  high-contrast control.
- Photos appear as cinematic, edge-to-edge editorial windows rather than card
  thumbnails.
- Rounded geometry is reserved for media and controls; content grouping relies
  on whitespace.

## Grammar 2: Airbnb-inspired travel warmth

Dial: `DESIGN_VARIANCE 7`, `MOTION_INTENSITY 6`, `VISUAL_DENSITY 4`.

- Travel photography is the orientation layer. Scenario and lesson details sit
  beside or directly below real places and actions.
- The learning path reads like an itinerary with destinations, context, and a
  tactile next action.
- Vocabulary is framed as a phrase to use in a place, not an abstract study
  record.
- Controls use bounded tactile surfaces, distinct pressed states, and warmer
  spatial rhythm.
- Desktop becomes a photo-led split story; mobile keeps the action reachable
  below the focal image.

## Grammar 3: Notion-inspired editorial publishing

Dial: `DESIGN_VARIANCE 4`, `MOTION_INTENSITY 3`, `VISUAL_DENSITY 5`.

- The product behaves like a well-edited learning document. Content blocks,
  headings, lists, and native disclosures form the interface.
- Chrome is reduced to a thin document header and page index. No floating nav
  or persistent action card.
- Lesson sections are readable in sequence and vocabulary uses definition-page
  hierarchy.
- Sharp geometry and sparse callouts keep the surface publishable and calm.
- Interaction is explicit through underlined page links, disclosure markers,
  and full-width selectable rows.

## Grammar 4: Linear-inspired precise premium UI

Dial: `DESIGN_VARIANCE 5`, `MOTION_INTENSITY 5`, `VISUAL_DENSITY 7`.

- A compact command rail and strict content stage separate global orientation
  from the current learning operation.
- Typography uses tight sans hierarchy, tabular metadata, and deliberate mono
  labels. Chinese remains the largest element.
- Geometry is crisp with small radii, fine dividers, and clearly differentiated
  hover, active, selected, and focus states.
- Lesson progress is a precise sequence in the margin rather than a card stack.
- Feedback changes state in place and never depends on color alone.

## Grammar 5: Duolingo-inspired mature progression

Dial: `DESIGN_VARIANCE 6`, `MOTION_INTENSITY 6`, `VISUAL_DENSITY 5`.

- A guided vertical path is the primary Home and travel structure. Current,
  complete, and next steps have unmistakable geometry and labels.
- Vocabulary and practice use one decision per screen with large reachable
  answer targets.
- Progress and feedback are immediate but restrained: no mascot, confetti,
  streak pressure, toy colors, or cartoon rewards.
- Rounded controls communicate touchability, while content sections remain
  mostly unboxed.
- Adult typography, muted colors, and practical travel outcomes replace
  childish game framing.

## Anti-skin validation

The versions must remain identifiable in grayscale:

- Apple: focal scale plus large quiet zones.
- Airbnb: image-led itinerary composition.
- Notion: document block flow and disclosure rhythm.
- Linear: compact rail, dense stage, and precise state geometry.
- Duolingo: guided progression path and one-decision practice framing.

If any pair loses those signatures after desaturation, the layout must be
reworked before evidence capture.

## Isolation boundary

- No changes to `BaseLayout.astro`, `Header.astro`, production routes, design
  tokens, loaders, storage keys, progress logic, or visual regression baselines.
- The lab uses its own layout, fixture adapter, controller, routes, and assets.
- Routes use `noindex, nofollow` and never appear in production navigation.
- Generated images are prototype-only and documented in `assets.json`.

