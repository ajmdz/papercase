# Agent Instructions

Build this project incrementally.

Use `docs/increment-roadmap.md` as the source of truth for increment order. Implement one increment at a time and stop for review before continuing.

Before starting any increment, open the matching GitHub issue from the issue map in `docs/increment-roadmap.md`. Treat the issue, roadmap section, and project brief as the working contract for that increment.

## GitHub Workflow

For each roadmap increment:

1. Open the matching GitHub issue and confirm it matches the roadmap.
2. Branch off of `feature`.
3. Develop the increment in that branch only.
4. Verify locally with tests and launch checks.
5. Verify with the user that the increment's development goal was achieved.
6. Commit only after the increment is accepted by the user, unless the user explicitly asks for checkpoint commits or an early draft pull request.
7. Open a pull request using `.github/PULL_REQUEST_TEMPLATE.md`.
8. Link the PR to the issue with `Closes #{issue-number}` only when the increment is complete.
9. Do not begin the next increment until the current pull request is reviewed or the user explicitly asks to continue.

Branch naming:

- Use `codex/increment-{number}-{short-name}`.
- Example: `codex/increment-00-project-foundation`.

Commit messages:

- Write meaningful commit messages that describe behavior, not just files changed.
- Prefer focused commits scoped to the increment.
- Examples:
  - `feat(app): add empty library shell`
  - `test(storage): cover duplicate import detection`
  - `docs(roadmap): clarify reader review criteria`

If the `feature` branch does not exist, or GitHub issue/PR creation is blocked by missing authentication, stop and ask the user how to proceed. Do not silently branch from another base.

## Increment Operating Checklist

### Starting An Increment

- Confirm the current increment number, title, issue URL, branch name, acceptance criteria, review focus, and non-goals.
- Sync from `feature` before branching.
- Use the branch listed in the roadmap issue map.
- If the branch already exists, inspect it before changing anything and continue only if it clearly belongs to the same increment.
- Do not combine multiple increments in one branch or PR.

### Planning Before Coding

Restate:

- The issue being worked.
- The increment goal.
- The user-visible outcome.
- The acceptance criteria.
- Files or areas likely to change.
- Test and launch checks.
- What is intentionally out of scope.

Wait for the user if the issue, roadmap, and current code disagree in a way that changes product behavior or architecture.

### During Implementation

- Keep the app runnable after each meaningful checkpoint.
- Prefer the smallest working path that satisfies the increment.
- Update docs only when behavior, architecture, setup, or workflow changes.
- Do not silently expand scope to satisfy future increments.
- If a future increment becomes easier because of a small preparatory change, include it only when it is necessary for the current increment and explain why.

### Before User Verification

Run the relevant checks, then summarize:

- What changed.
- What acceptance criteria are satisfied.
- What commands were run.
- What the user should manually inspect.
- Any known limitations or follow-ups.

For UI increments, include screenshots or a short recording when practical.

### After User Acceptance

- Commit with meaningful messages.
- Open a PR from the increment branch into `feature`.
- Use the PR template.
- Include `Closes #{issue-number}` when all acceptance criteria are done.
- Leave the issue open if the PR is a draft or the increment is incomplete.
- Stop after the PR is opened and wait for review or explicit instruction.

## Principles

- Prefer simple, boring solutions.
- Build only the current slice.
- Keep business logic separate from framework and infrastructure code.
- Do not add abstractions until they are earned.
- Write tests for behavior.
- Keep docs current when behavior or architecture changes.

## Before Coding

Restate the goal, then propose a short plan.

Include:

- GitHub issue number or issue creation plan
- GitHub issue URL
- Branch name
- Acceptance criteria
- Review focus
- Files to change
- Design approach
- Tradeoffs
- What is intentionally not included

## While Coding

- Keep changes small.
- Use clear names.
- Prefer explicit code over clever code.
- Keep IO and external services at the edges.
- Do not add features outside the request.
- Add meaningful and intuitive doc comments

## After Coding

Summarize:

- What changed
- What was tested
- What needs user verification
- GitHub issue and branch status
- What remains
