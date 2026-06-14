# Increment Roadmap

This roadmap turns the project brief into a sequence of small, reviewable development increments. Each increment should leave the app in a coherent state that can be launched, inspected, and either accepted or revised before moving on.

The goal is not to finish quickly. The goal is to keep the architecture simple, make taste decisions visible, and avoid burying product choices inside large code drops.

## How To Use This Roadmap

For every increment, Codex should:

1. Read `docs/project-brief.md`, `docs/agent-instructions.md`, and this roadmap.
2. Create or confirm a GitHub issue for the increment.
3. Branch off of `feature` using `codex/increment-{number}-{short-name}`.
4. Restate the increment goal before coding.
5. Propose a short implementation plan with issue number, branch name, files to change, design approach, tradeoffs, and non-goals.
6. Implement only the current increment.
7. Run relevant tests and launch checks.
8. Ask the user to verify that the increment goal was achieved.
9. After user acceptance, write meaningful commit messages and open a pull request using `.github/PULL_REQUEST_TEMPLATE.md`.
10. Stop for review before starting the next increment.

The reviewer should inspect both behavior and feel. A technically correct increment can still be sent back if the interaction feels awkward, visually noisy, or too broad.

## GitHub Issue And PR Workflow

Use one GitHub issue and one pull request per increment.

### Issue Map

| Increment | Issue | Branch |
| --- | --- | --- |
| Increment 0: Project Foundation | [#1](https://github.com/ajmdz/papercase/issues/1) | `codex/increment-00-project-foundation` |
| Increment 1: Local Persistence And Storage | [#2](https://github.com/ajmdz/papercase/issues/2) | `codex/increment-01-local-persistence-and-storage` |
| Increment 2: Import Pipeline | [#3](https://github.com/ajmdz/papercase/issues/3) | `codex/increment-02-import-pipeline` |
| Increment 3: Library Management | [#4](https://github.com/ajmdz/papercase/issues/4) | `codex/increment-03-library-management` |
| Increment 4: Reader Shell | [#5](https://github.com/ajmdz/papercase/issues/5) | `codex/increment-04-reader-shell` |
| Increment 5: PDF Reading | [#6](https://github.com/ajmdz/papercase/issues/6) | `codex/increment-05-pdf-reading` |
| Increment 6: EPUB Reading | [#7](https://github.com/ajmdz/papercase/issues/7) | `codex/increment-06-epub-reading` |
| Increment 7: Bookmarks | [#8](https://github.com/ajmdz/papercase/issues/8) | `codex/increment-07-bookmarks` |
| Increment 8: Highlight Foundation | [#9](https://github.com/ajmdz/papercase/issues/9) | `codex/increment-08-highlight-foundation` |
| Increment 9: PDF Highlights | [#10](https://github.com/ajmdz/papercase/issues/10) | `codex/increment-09-pdf-highlights` |
| Increment 10: EPUB Highlights | [#11](https://github.com/ajmdz/papercase/issues/11) | `codex/increment-10-epub-highlights` |
| Increment 11: Reader Polish And Hardening | [#12](https://github.com/ajmdz/papercase/issues/12) | `codex/increment-11-reader-polish-and-hardening` |
| Increment 12: V1 Release Candidate | [#13](https://github.com/ajmdz/papercase/issues/13) | `codex/increment-12-v1-release-candidate` |

### Issue Creation

Create issues from the roadmap before implementation begins. It is acceptable to create all increment issues up front under a `v1` milestone, or create them one at a time before each increment. Creating them up front is usually more efficient because it gives the project a visible backlog while still preserving one-increment-at-a-time development.

Each issue should include:

- Increment number and title.
- Goal.
- User-visible outcome.
- Scope.
- Acceptance criteria.
- Review focus.
- Non-goals.

Use `.github/ISSUE_TEMPLATE/increment.md` when creating these issues.

### Branching

Each increment branch must start from `feature`.

Recommended branch format:

```text
codex/increment-{number}-{short-name}
```

Examples:

```text
codex/increment-00-project-foundation
codex/increment-02-import-pipeline
codex/increment-09-pdf-highlights
```

If `feature` is missing, stale, or not clear, stop and ask the user before creating a branch.

Before coding, use the issue map branch name exactly. If a branch already exists remotely for that increment, fetch it and inspect it before continuing.

### Development Loop

For each increment:

1. Open or confirm the GitHub issue.
2. Branch from `feature` using the issue map branch name.
3. Implement only that increment.
4. Keep commits local until the user has reviewed the result, unless the user asks for checkpoint commits or an early draft pull request.
5. Run tests and launch checks.
6. Show the user what changed and what to review.
7. Wait for user acceptance or requested revisions.
8. Commit with meaningful messages after acceptance.
9. Open the pull request into `feature` using the PR template.
10. Include `Closes #{issue-number}` only when the increment is complete.
11. Stop for review before starting the next increment.

### Recommended Efficient Variant

For larger increments, ask the user whether they want an early draft pull request after the first coherent checkpoint. This gives the user a stable place to review the diff, screenshots, notes, and discussion while development continues. Keep the PR in draft until the user confirms the increment goal is achieved.

The review gates should remain:

- Plan accepted.
- Development result verified by user.
- Pull request opened or marked ready.
- Next increment started only after approval or explicit instruction.

### Pull Requests

Every PR should:

- Link the increment issue.
- Include `Closes #{issue-number}` when the increment is complete.
- State the increment goal.
- Summarize user-visible changes.
- List tests and launch checks.
- Include screenshots or short screen recordings for UI increments when possible.
- Call out non-goals and known follow-ups.
- Use `.github/PULL_REQUEST_TEMPLATE.md`.

## Architecture Direction

### Runtime Shape

- Electron main process owns filesystem access, import/copy/delete behavior, hashing, local database access, and application lifecycle.
- Preload exposes a small typed API to the renderer through `contextBridge`.
- React renderer owns UI, navigation, reader layout, selection controls, and visual state.
- Renderer code should not access Node filesystem APIs directly.
- Reader-specific behavior should sit behind adapters, so PDF and EPUB complexity does not leak across the app.

### Local Storage

Use local app storage for v1.

Recommended shape:

```text
appData/
  papercase.sqlite
  books/
    {bookId}/
      source.pdf
      source.epub
      cover.png
```

The exact root should be resolved through Electron's app data APIs. Electron documents `app.getPath('userData')` as the app-specific user data location, and recommends app-specific subdirectories for stored files.

### Persistence Model

Use a local database for structured state. SQLite is the preferred default because the app is local-first, offline, and needs durable relational data without a server.

Initial entities:

| Entity | Purpose |
| --- | --- |
| `books` | Imported book records, file hash, format, title, cover path, storage path, created date, last opened date |
| `reading_progress` | Per-book location, page, chapter, EPUB CFI or PDF page/offset, updated date |
| `highlights` | Per-book text highlights, color, selected text, reader-specific location data, note, created/updated dates |
| `bookmarks` | Per-book lightweight saved locations without selected text |
| `settings` | Global theme, EPUB font size, and other app-level preferences |
| `schema_migrations` | Durable migration tracking |

The database should store stable metadata and location references. The copied book files and generated covers should live on disk.

### Import Pipeline

Importing should be handled in the main process:

1. User chooses an EPUB or PDF file.
2. App computes a content hash before copying.
3. If the same hash already exists, block the import.
4. App copies the file into local app storage.
5. App extracts title and cover when possible.
6. If metadata is missing, app uses the filename as the title and generates a simple cover using the filename.
7. App creates the book record and returns the updated library list.

### Reader Adapters

Create a shared reader shell, then add format-specific adapters:

| Adapter | Responsibilities |
| --- | --- |
| `PdfReaderAdapter` | Render pages, navigate pages, handle single/two-page view, expose text selection, store PDF highlight locations, apply PDF dark mode |
| `EpubReaderAdapter` | Render paginated EPUB content, navigate sections/chapters, expose EPUB locations, handle font size/theme, store EPUB highlight locations |

Each adapter should expose a small common shape:

```ts
type ReaderLocation = {
  bookId: string;
  format: "pdf" | "epub";
  location: unknown;
  label?: string;
};
```

The app can refine this type later. Early increments should avoid pretending PDF page geometry and EPUB CFI locations are the same thing.

### IPC Boundary

Keep IPC explicit and narrow.

Likely API groups:

| API group | Example methods |
| --- | --- |
| `library` | `listBooks`, `importBook`, `removeBook`, `getBook` |
| `progress` | `getProgress`, `saveProgress` |
| `highlights` | `listHighlights`, `createHighlight`, `updateHighlight`, `deleteHighlight` |
| `bookmarks` | `listBookmarks`, `createBookmark`, `deleteBookmark` |
| `settings` | `getSettings`, `updateSettings` |

Prefer request/response IPC methods over shared mutable state. Validate inputs at the boundary.

### Security Baseline

- Keep `nodeIntegration` off in renderer windows.
- Keep `contextIsolation` on.
- Validate IPC senders and payloads.
- Avoid loading arbitrary remote content.
- Treat EPUB content as untrusted document content. Do not enable scripted EPUB content for v1.
- Prefer a controlled local/custom protocol for copied book assets instead of exposing broad filesystem paths to the renderer.

### Candidate Libraries To Evaluate

These are starting points, not final commitments:

| Area | Candidate | Why |
| --- | --- | --- |
| PDF rendering | [PDF.js](https://mozilla.github.io/pdf.js/) | Mozilla describes it as a web standards-based platform for parsing and rendering PDFs. |
| EPUB rendering | [EPUB.js](https://github.com/futurepress/epub.js/) | It supports browser EPUB rendering, pagination, common ebook functions, and examples for highlights. It should be spiked before committing because the project cadence may be a risk. |
| Local database | [SQLite](https://www.sqlite.org/index.html) | Small, durable, local database suited to offline app data. |
| Electron storage/security | [Electron app paths](https://www.electronjs.org/docs/latest/api/app#appgetpathname), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security) | Use official app data paths and keep the renderer isolated. |

## Taste And Review Principles

Every increment should be reviewed for:

- Calm, minimalist interface with low visual noise.
- Clear hierarchy without oversized decorative UI.
- Native-feeling macOS window behavior where practical.
- No surprise feature creep.
- No hidden destructive actions.
- Text that fits and labels that are plain.
- Empty, loading, error, and destructive states that feel considered.
- Fast enough interaction for normal files.

Good taste here means restraint: fewer controls, clear placement, and a reading experience that gets out of the way.

## Increment 0: Project Foundation

### Goal

Create the runnable Electron, React, and TypeScript foundation.

### User-Visible Outcome

The app opens on macOS and shows a quiet empty library shell.

### Scope

- Electron main/preload/renderer setup.
- React app shell.
- TypeScript configuration.
- Build, dev, lint, format, and test scripts.
- Basic app window and empty library route.
- Initial design tokens for typography, spacing, color, light/dark theme variables.
- Initial architecture notes in docs if setup decisions differ from this roadmap.

### Acceptance

- App launches locally on macOS.
- Renderer cannot directly access Node filesystem APIs.
- Dev command and test command are documented.
- Empty library state is visible and tasteful.

### Review Focus

- Does the shell feel like the start of a focused reader, not a generic dashboard?
- Are the defaults quiet and readable?
- Is the code structure boring and easy to follow?

### Non-Goals

- Real imports.
- Real database.
- PDF or EPUB rendering.
- Annotations.

## Increment 1: Local Persistence And Storage

### Goal

Create the durable local storage layer before adding user workflows.

### User-Visible Outcome

The app still shows an empty library, but it now initializes local storage and can persist simple book records in development tests.

### Scope

- App data directory resolution.
- Database setup and migration runner.
- Initial schema for books, progress, highlights, bookmarks, settings, and migrations.
- Storage path helpers for copied book files and generated covers.
- Repository tests for basic create/read/delete behavior.

### Acceptance

- Database is created in the expected local app data area.
- Migrations are idempotent.
- Tests cover repository behavior.
- No UI feature depends on hardcoded sample data.

### Review Focus

- Are filesystem and database details kept out of the renderer?
- Are names understandable enough to survive later increments?

### Non-Goals

- Import UI.
- Metadata extraction.
- Reader UI.

## Increment 2: Import Pipeline

### Goal

Allow EPUB and PDF files to be imported into local storage.

### User-Visible Outcome

The user can import a PDF or EPUB and see it appear in the library.

### Scope

- File picker for `.pdf` and `.epub`.
- Main-process import service.
- Content hash computation.
- Duplicate blocking for exactly identical files.
- File copy into app storage.
- Basic metadata extraction where practical.
- Filename fallback title.
- Generated filename cover fallback.
- Import success, duplicate, and failure states.

### Acceptance

- A PDF can be imported and persists after restart.
- An EPUB can be imported and persists after restart.
- Re-importing the exact same file is blocked.
- Missing metadata falls back to filename and generated cover.
- Original source file can be moved or deleted without breaking the imported library item.

### Review Focus

- Does import feel calm and unsurprising?
- Is the duplicate message clear without being dramatic?
- Does the generated cover look intentional rather than broken?

### Non-Goals

- Opening books.
- Reading progress.
- Highlighting.

## Increment 3: Library Management

### Goal

Make the library screen useful and honest about destructive actions.

### User-Visible Outcome

The user can browse imported books and remove a book from the library.

### Scope

- Library grid or list with title, cover, and progress.
- Empty state.
- Basic sorting, likely last opened or import date if available.
- Remove book action.
- Confirmation before removal.
- Removal deletes copied file, progress, highlights, notes, and bookmarks.
- Error state if local data cannot be removed cleanly.

### Acceptance

- Imported books are visible with title, cover, and progress.
- Removing a book deletes its local copy and associated records.
- Removal is clearly described before confirmation.
- Canceling removal leaves everything intact.

### Review Focus

- Does the library feel like a personal reading shelf rather than a file manager?
- Is the destructive copy plain and impossible to misread?

### Non-Goals

- Tags.
- Search.
- Cloud backup.
- Advanced organization.

## Increment 4: Reader Shell

### Goal

Create the shared reading layout and navigation frame.

### User-Visible Outcome

The user can open a book into a reader screen with a toolbar, back navigation, and placeholder reader area.

### Scope

- Reader route/state.
- Shared reader toolbar.
- Back to library.
- Global theme control.
- Placeholder areas for table of contents, page/location indicator, bookmarks, and highlights.
- Shared reader location model.

### Acceptance

- Opening a library item navigates to a reader screen.
- Reader shell handles missing/deleted local files gracefully.
- Theme changes are reflected in the shell and persisted.
- Layout works at normal laptop sizes.

### Review Focus

- Does the reader chrome stay out of the way?
- Are controls discoverable without feeling busy?

### Non-Goals

- Actual PDF or EPUB rendering.
- Progress persistence beyond shell state.
- Highlights and bookmarks.

## Increment 5: PDF Reading

### Goal

Make PDFs readable.

### User-Visible Outcome

The user can open an imported PDF, read pages, switch page view, use dark mode, and return later to the same place.

### Scope

- PDF rendering through the selected PDF library.
- Page navigation.
- Single-page and two-page view.
- Page number display.
- PDF outline/table of contents when available.
- Reading progress persistence.
- PDF dark mode with inverted page colors and dark viewer background following the global theme.
- Basic zoom behavior if needed for comfortable reading.

### Acceptance

- A normal selectable-text PDF renders.
- Page navigation works.
- Single-page and two-page modes work.
- Last page is restored after app restart.
- Dark mode follows global theme.
- PDF with no outline still remains usable.

### Review Focus

- Is reading comfortable for a real PDF, not just a demo file?
- Does dark mode improve comfort without making controls confusing?
- Does two-page mode feel stable and not cramped?

### Non-Goals

- PDF highlights.
- OCR.
- DRM.

## Increment 6: EPUB Reading

### Goal

Make EPUBs readable.

### User-Visible Outcome

The user can open an imported EPUB, read paginated content, change font size, use the table of contents, and return later to the same place.

### Scope

- EPUB rendering through the selected EPUB approach.
- Paginated reading.
- Chapter/section navigation.
- Table of contents when available.
- EPUB font size control.
- EPUB light/dark mode following global theme.
- Reading progress persistence.
- Scripted EPUB content disabled for v1.

### Acceptance

- A normal EPUB renders in paginated mode.
- Font size changes update the reading layout.
- Last location is restored after app restart.
- Table of contents entries jump to the right location.
- Dark mode is readable.

### Review Focus

- Does it feel like reading, or like browsing a web page inside a box?
- Is font sizing tasteful and stable?
- Are page transitions understandable?

### Non-Goals

- EPUB highlights.
- Continuous scrolling.
- Custom EPUB themes beyond light/dark and font size.

## Increment 7: Bookmarks

### Goal

Add lightweight saved locations for both formats.

### User-Visible Outcome

The user can bookmark the current location, see bookmarks for the book, jump to them, and remove them.

### Scope

- Bookmark create/delete.
- Bookmark list for the current book.
- Jump from bookmark to saved location.
- Format-specific location serialization through reader adapters.
- Optional bookmark label based on page/chapter/location.

### Acceptance

- Bookmarks work in PDF.
- Bookmarks work in EPUB.
- Bookmarks survive restart.
- Jumping from a bookmark restores the expected location.
- Deleting a bookmark does not affect highlights or progress.

### Review Focus

- Is bookmarking fast and lightweight?
- Does the bookmark list avoid clutter?

### Non-Goals

- Tags.
- Bookmark notes.
- Cross-book bookmark search.

## Increment 8: Highlight Foundation

### Goal

Build the shared annotation model and interaction shell.

### User-Visible Outcome

The reader has a polished selection popup pattern ready for format-specific highlighting.

### Scope

- Highlight data model and repository behavior.
- Highlight colors.
- Optional notes.
- Create/update/delete APIs.
- Shared selection popup component.
- Highlight list panel UI.
- Empty and error states for highlight list.

### Acceptance

- Highlight records can be created, updated, listed, and deleted in tests.
- Popup supports add note, change color, and delete actions.
- Highlight list UI is present but can be wired to one format first in later increments.

### Review Focus

- Is the popup small, precise, and non-intrusive?
- Do colors feel useful without making the reader look loud?

### Non-Goals

- Actual PDF selection anchoring.
- Actual EPUB selection anchoring.

## Increment 9: PDF Highlights

### Goal

Support highlights in selectable-text PDFs.

### User-Visible Outcome

The user can select text in a PDF, highlight it, change the color, add a note, delete it, see it in the highlight list, and jump back to it.

### Scope

- PDF text selection capture.
- PDF highlight anchoring strategy.
- Render saved highlights on PDF pages.
- Popup actions wired to PDF selections.
- Highlight list jump behavior.
- Behavior across zoom, single-page, two-page, light mode, and dark mode.

### Acceptance

- Highlight creation works on selectable-text PDFs.
- Highlights persist after app restart.
- Highlight color and note edits persist.
- Deleting a highlight removes it from page and list.
- Jumping from the list navigates to the highlighted location.
- Scanned PDFs fail gracefully because OCR is out of scope.

### Review Focus

- Do highlights stay visually attached to the selected text?
- Does the interaction feel reliable enough to trust?
- Are failure states clear when a PDF does not expose selectable text?

### Non-Goals

- OCR.
- Freehand drawing.
- Shape annotations.

## Increment 10: EPUB Highlights

### Goal

Support highlights in EPUBs.

### User-Visible Outcome

The user can select EPUB text, highlight it, edit color/note, delete it, see it in the highlight list, and jump back to it.

### Scope

- EPUB selection capture.
- EPUB location anchoring, likely CFI or adapter-specific equivalent.
- Render saved EPUB highlights.
- Popup actions wired to EPUB selections.
- Highlight list jump behavior.
- Behavior across font size changes and theme changes.

### Acceptance

- Highlight creation works in EPUB.
- Highlights persist after restart.
- Highlights survive font size changes.
- Highlight list jumps to the right location.
- Notes, colors, and deletion work.

### Review Focus

- Do highlights remain stable when the text reflows?
- Does the popup feel natural inside paginated EPUB content?

### Non-Goals

- Cross-book note search.
- Export.
- Tags.

## Increment 11: Reader Polish And Hardening

### Goal

Turn the individual features into a cohesive v1 reading experience.

### User-Visible Outcome

The app feels like one product rather than separate feature slices.

### Scope

- Consistent toolbar and panels across PDF and EPUB.
- Loading states.
- File error states.
- Empty library and empty highlight/bookmark states.
- Keyboard and pointer interaction pass.
- Performance pass with a few larger files.
- Migration and data resilience checks.
- Visual polish on library cards, generated covers, reader spacing, and destructive confirmations.

### Acceptance

- Core flows work without developer tools.
- No obvious layout overlap at common macOS laptop sizes.
- Large-ish PDFs and EPUBs remain usable.
- All destructive actions confirm clearly.
- Tests cover critical import, duplicate, remove, progress, bookmark, and highlight behavior.

### Review Focus

- Does the app feel quiet, personal, and durable?
- Are there any controls that feel premature or ornamental?
- Does the reading surface remain the center of attention?

### Non-Goals

- New major features.
- AI.
- Sync.

## Increment 12: V1 Release Candidate

### Goal

Prepare a reviewable macOS v1 candidate.

### User-Visible Outcome

The app can be installed or run as a packaged macOS build for final review.

### Scope

- macOS packaging.
- App icon placeholder or final icon if available.
- Basic smoke test checklist.
- Version number.
- Known limitations doc.
- Final project brief and roadmap update.

### Acceptance

- Packaged macOS build launches.
- Import, read, progress, bookmarks, highlights, and removal work in the packaged app.
- Known limitations are documented.
- No out-of-scope features slipped into v1.

### Review Focus

- Would you trust this app with a small real reading library?
- Does the product feel like Papercase yet?

### Non-Goals

- App Store distribution.
- Auto-update.
- Code signing/notarization unless explicitly needed for local testing.

## Suggested First Codex Handoff

Start with Increment 0 only.

Prompt Codex with:

```text
Read docs/project-brief.md, docs/agent-instructions.md, and docs/increment-roadmap.md.
Implement Increment 0: Project Foundation only.
Use GitHub issue #1: https://github.com/ajmdz/papercase/issues/1.
Branch off of feature using codex/increment-00-project-foundation.
Before coding, restate the goal and propose a short plan with the issue number, issue URL, branch name, acceptance criteria, review focus, files to change, design approach, tradeoffs, and non-goals.
After coding, run the relevant checks, launch the app if possible, and summarize what changed, what was tested, what needs my verification, and what remains.
Do not commit or open the pull request until I verify that the increment goal was achieved.
```

After Increment 0 is accepted, continue one increment at a time.
