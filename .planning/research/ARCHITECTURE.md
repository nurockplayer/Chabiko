# Research: Architecture

## Components

- Content source: versioned structured files in the repo.
- Content validation: schema checks for required fields and source metadata.
- Learning pages: render lessons, examples, and review prompts.
- Vocabulary explorer: filter by category, similarity type, caution flag, and scenario.
- Phrasebook: travel scenario pages with example dialogs.
- Practice engine: local, deterministic quiz flows using browser state only for v1.
- Resource registry: curated external links with license/reuse notes.

## Data Flow

1. Authors edit content files.
2. Validation checks schema and required attribution fields.
3. Static build renders content into pages.
4. User reads lessons and practices locally.
5. Future phases can add audio, spaced repetition, or accounts without changing the content source.

## Build Order

1. Establish app scaffold and content schemas.
2. Add seed content for lessons, vocabulary, phrases, and resources.
3. Build reading and browsing UI.
4. Add practice interactions.
5. Add CI and deploy previews.

## Boundaries

Content quality and licensing are product requirements, not optional editorial cleanup. The architecture must make missing source/review metadata hard to ignore.

