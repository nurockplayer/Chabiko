# Chabiko V2 consumer UX reference authority

**Status:** Canonical for the isolated V2 consumer UX reference initiative  
**Scope:** `/v2-reference/` and later V2 work that explicitly adopts this document  
**Product method:** Japanese prior knowledge → usable Mandarin

## V2 decisions

V2 is a Mandarin capability system for Japanese adults, not a fixed set of three courses. The first reference follows one complete loop:

> Learn → Retrieve → Repair → Reuse → Return

For V2, the following decisions are V1 or historical authority only and do not constrain V2 information architecture or composition:

- exactly three first-class tracks;
- Home Dashboard;
- Learn / Practice / Test;
- the production Header, breadcrumb, and TrackNav shell;
- A1 Editorial Calm, including Mincho-led kicker and hairline compositions;
- the current production route organization.

Those contracts remain valid for the production V1 surfaces that still adopt them. This document does not rewrite or delete their history.

Issue lineage: #365, #371, and #389 remain V1 implementation authority; #425 remains production V1 affordance evidence. Their resting-affordance lessons carry forward, but their route and composition decisions do not bind this V2 reference.

## What V2 keeps

V2 reuses Taiwan, teacher, and HSK learning content together with the existing traditional/simplified, pinyin, regional-usage, provenance, and review models. It also keeps answer secrecy, deterministic state correctness, accessibility, and capability/evidence knowledge as engineering constraints.

## Experience and visual direction

The product should turn knowledge a Japanese learner already has into Mandarin they can use in a real situation. Taiwan is the first situational wedge, not decorative travel branding.

> **Quietly Vivid × Tactile × Situational**  
> Calm shell, vivid learning moments. Passive content stays flat; interactive objects look and feel pressable before interaction.

Each mobile screen must establish three readable planes: content, action, and navigation. The scene and Chinese are the visual leads. Japanese and Chinese use clear sans-serif typography. Result states report real learning evidence, not XP, streaks, badges, confetti, or lesson percentages.

## First reference boundary

The first reference is an isolated, unlisted flow at `/v2-reference/`:

1. 今日
2. Taiwan Learning
3. Retrieval / Repair
4. Result

It reuses the reviewed `lesson-001` core sentence `我要這個`. It must remain absent from production navigation and must not modify `/` or any current production route. It is a working reference for evaluation, not a production migration or a new global design system.

Excluded from this reference: production redesign, HSK V2, teacher-vocabulary V2, Search, AI tutor, account/cloud work, dark-mode redesign, desktop redesign, capability-graph rewrites, and follow-on V2 issue planning.
