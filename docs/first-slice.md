# First Slice

Issue: [#1 Increment 0: Project Foundation](https://github.com/ajmdz/papercase/issues/1)
Branch: `codex/increment-00-project-foundation`

## Goal

Create the first user-visible foundation for Papercase: a runnable macOS Electron app with a quiet empty library shell.

## User Story

As a user, I want to open Papercase and see the beginning of my local library, so that future import and reading features have a clear home.

## Happy Path

1. The developer runs the local dev command.
2. Papercase opens as a desktop app on macOS.
3. The app shows an empty library screen with clear import affordance copy, even if import is not implemented yet.
4. The app can be closed and relaunched without errors.

## Edge Cases

- The app launches before any database or imported books exist.
- The renderer should not have direct filesystem access.
- The empty state should not imply cloud sync, AI, or web article support.

## Acceptance Criteria

- [ ] Electron, React, and TypeScript are set up.
- [ ] The app launches locally on macOS.
- [ ] The renderer uses a preload boundary rather than direct Node filesystem access.
- [ ] The empty library screen is visually quiet and aligned with the project brief.
- [ ] Dev, test, and build commands are documented.

## Non-Goals

- Importing books.
- Opening PDFs or EPUBs.
- Database persistence.
- Highlights, notes, bookmarks, or reading progress.

## Agent Handoff

Before coding, the agent should read:

- `docs/project-brief.md`
- `docs/agent-instructions.md`
- `docs/increment-roadmap.md`
- GitHub issue #1

The agent should branch from `feature`, implement only this slice, verify locally, ask for user review, and commit/open the pull request only after user acceptance.
