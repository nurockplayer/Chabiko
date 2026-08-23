# Chabiko V2 Consumer Reference Authority

Status: canonical for V2 consumer UX reference work  
Adopted: 2026-08-23

## Product direction

Chabiko V2 turns Japanese prior knowledge into Mandarin a learner can use in a real situation.

The visual thesis is **Quietly Vivid × Tactile × Situational**:

- the shell stays calm while the scene and Chinese learning moment carry the energy;
- passive content stays visually flat;
- interactive objects look and feel pressable before interaction;
- progress is expressed as usable learning evidence, not engagement rewards.

## V1 authority boundary

The A1 Editorial Calm direction, exactly three first-class tracks, Home Dashboard, Learn / Practice / Test structure, Header / breadcrumb / TrackNav composition, and current route organization remain V1 production or historical authority only. Decisions recorded in #365, #371, #389, #424 / PR #425, and `reference-family-389.md` do not constrain V2 information architecture or composition.

This boundary does not redesign or deprecate existing production routes. Those routes keep their current contracts until a separately scoped V2 migration explicitly replaces them.

## Preserved contracts and assets

V2 should reuse, rather than remodel without cause:

- Taiwan, teacher, and HSK learning content;
- Traditional / Simplified Chinese, pinyin, and regional-usage modeling;
- provenance and review metadata;
- answer secrecy and deterministic state correctness;
- accessibility contracts;
- capability and learning-evidence knowledge.

## First reference scope

`/v2-reference/` is an isolated, unlisted, `noindex` consumer reference. Its first flow is:

`今日 → Taiwan learning → retrieval / repair → result`

The reference uses the reviewed `我要這個` Taiwan lesson and tests the method on mobile first. It must not alter `/`, production navigation, existing learner routes, or shared A1 tokens and components.

This reference does not freeze a V2 palette, radius scale, complete token system, desktop design, production route migration, or the next V2 issue set. Those decisions require evidence from this and later references.
