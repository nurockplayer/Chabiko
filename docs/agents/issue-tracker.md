# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `rtk gh` CLI for all operations.

## Conventions

- **Create an issue**: `rtk gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `rtk gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `rtk gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `rtk gh issue comment <number> --body "..."`
- **Apply / remove labels**: `rtk gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `rtk gh issue close <number> --comment "..."`

Infer the repo from `rtk git remote -v` — `rtk gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

When set to `yes`, PRs run through the same labels and states as issues, using the `rtk gh pr` equivalents.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `rtk gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue. Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body.
- **Blocking**: use GitHub native issue dependencies; if unavailable, write `Blocked by: #<n>` at the top of the child body.
- **Claim**: `rtk gh issue edit <n> --add-assignee @me`.
- **Resolve**: comment, close the issue, then add a context pointer to the map's Decisions-so-far.
