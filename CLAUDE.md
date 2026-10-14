# Chabiko — Claude Code Notes

@~/.claude/CLAUDE.md

Repository rules live in `AGENTS.md`. This file adds Claude Code specifics only.

- Claude leads: product decisions, integration, review triage, merge, deploy, and GitHub decision records.
- Delegate implementation to Codex in isolated worktrees; use a fresh read-only Codex session for independent review.
- Conversation may follow the user's language; committed technical artifacts are English.
- Use `graphify` for navigation only; do not regenerate or commit `graphify-out/` unless asked.
