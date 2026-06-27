## Goal

Add CI, content validation, and deploy previews so v1 can be reviewed safely.

## Scope

- Add GitHub Actions for build, lint/typecheck/test, content schema validation, and lockfile policy.
- Reject accidental non-pnpm lockfiles.
- Add deployment preview workflow after hosting target is chosen.
- Keep automation conservative and non-destructive.

## Out of scope

- Auto-close PR policy.
- Dependency auto-merge.
- Production release automation.

## Acceptance criteria

- [ ] CI runs build and validation checks on PRs.
- [ ] CI rejects `package-lock.json`, `yarn.lock`, `bun.lock`, and `bun.lockb`.
- [ ] Content schema validation runs in CI.
- [ ] Deployment preview is available for PRs or a blocker is documented.
- [ ] No high-impact automation is enabled without explicit approval.

## Source of truth

- `.planning/REQUIREMENTS.md`: FOUND-04, QUAL-02.
- `.planning/ROADMAP.md` Phase 4, plan 04-01.

