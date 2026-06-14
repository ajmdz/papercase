# Project Brief

## Problem

I want one local place for my reading materials, highlights, notes, and bookmarks. Instead of being scattered across files and apps, my reading history should become a useful personal library that can eventually support second-brain and AI features.

## User

This is primarily for me: someone who reads across formats such as EPUB, PDF, and web articles, and wants to keep highlights, notes, and reading progress organized in one place.

For the first version, the focus is on local EPUB and PDF reading. Web articles and second-brain features can come later.

## First Useful Version

A local desktop app where I can import EPUB and PDF files, open them from a library view, read them comfortably, save my place, and keep highlights, notes, and bookmarks.

The first version should be a solid reader and annotation foundation. AI and second-brain features are intentionally deferred until the reading and persistence experience is reliable.

## Success

How will we know the first version worked?

- EPUB and PDF files can be imported and copied into the app's local library.
- If an imported file is exactly the same as a file already in the library, the import is blocked.
- Imported books appear on a home screen or library screen with title, cover, and reading progress.
- EPUB and PDF files render reliably enough for normal reading.
- Readers can navigate pages, chapters, or sections.
- A table of contents is shown when the file provides one.
- PDF reading supports single-page and two-page views.
- PDF dark mode uses both inverted page colors and a dark viewer background, following the global app theme.
- EPUB reading is paginated and supports adjustable font size.
- EPUB reading supports light and dark mode.
- The app remembers the last reading position for each book.
- Text can be highlighted in EPUB and selectable-text PDF files.
- After selecting text, a small popup lets the reader create or edit a highlight, add a note, change the highlight color, or delete the highlight.
- A list of highlights is available for each book and can jump back to the highlighted location.
- Bookmarks can be saved as lightweight reading locations without selected text.

## In Scope

- Local desktop app.
- macOS as the primary v1 operating system target.
- Importing EPUB and PDF files.
- Blocking duplicate imports when the file is exactly the same as an existing library item.
- Copying imported files into local app storage.
- Home/library screen showing imported books.
- Library metadata: title, cover, and reading progress.
- EPUB reader.
- PDF reader.
- Page, chapter, or section navigation.
- Table of contents when available.
- PDF single-page and two-page reading views.
- PDF dark mode with inverted page colors and dark viewer background.
- PDF dark mode follows the global app theme.
- Paginated EPUB reading.
- EPUB font size control.
- Light and dark mode for EPUB.
- Text highlights for EPUB and selectable-text PDFs.
- Notes attached to highlights.
- Highlight color changes.
- Highlight deletion.
- Per-book highlight list.
- Jumping from a highlight list item back to its location.
- Per-book reading progress.
- Bookmarks as saved locations inside books, separate from highlights.
- Page numbers or location indicators where the format supports them.
- Removing a book from the library deletes the copied file and its associated reading progress, highlights, notes, and bookmarks.
- If a book has missing title or cover metadata, the library uses the filename as the title and shows a simple generated cover using the filename.

## Out of Scope

- AI chat or second-brain features.
- Web article capture or browser extension support.
- Online accounts, sync, or cloud backups.
- Mobile app.
- Social sharing or collaboration.
- DRM-protected ebooks.
- OCR for scanned PDFs.
- Full-text search across the whole library.
- Tags and advanced organization.
- Exporting notes and highlights.
- Referencing files from their original location instead of copying them into the app.

## Constraints

- Stack: TypeScript, Electron, and React.
- Primary v1 operating system target: macOS.
- Future mobile version: React Native, but not part of v1.
- Imported files, reading progress, bookmarks, highlights, and notes should be stored locally for the first version.
- Imported files should be copied into the app's local storage so moving, renaming, or deleting the original file does not break the library.
- The app should work offline.
- Design direction: minimalist, quiet, and Notion-like.
- Prioritize reliability over breadth of features.

## Risks

- PDF highlighting can be difficult, especially across zoom levels, layouts, and renderer changes.
- Saving highlight positions reliably may differ between EPUB and PDF formats.
- Scanned PDFs will not support text selection unless OCR is added later.
- Large files may create performance issues.
- Reading progress, bookmarks, highlights, and notes need durable local persistence.
- Future schema changes may require data migrations.
- EPUB rendering can vary depending on file structure, images, custom fonts, and tables.
- PDF color inversion may make some documents harder to read, especially documents with images, charts, or custom backgrounds.
- Since imported files are copied into local app storage, accidental changes to the app data folder could affect the library.
- Removing a book is destructive because it deletes the local copy and all associated reading data, so the UI should make that clear.
- Duplicate detection requires a reliable way to compare imported files, such as a file hash.

## Product Decisions

- Imported files are copied into the app's local storage.
- Moving, renaming, or deleting the original imported file should not break the app, because the app uses its local copy.
- PDF dark mode should invert page colors and use a dark viewer background.
- PDF dark mode should follow the global app theme.
- EPUB reading should be paginated for v1.
- Highlights should be editable after creation.
- Highlight interactions should happen through a small selection popup with actions for notes, color changes, and deletion.
- The highlight list should let users jump back to highlighted locations.
- Bookmarks are separate from highlights and represent lightweight saved locations without selected text.
- The library only needs to show title, cover, and reading progress for v1.
- The primary v1 OS target is macOS.
- Removing a book from the library deletes the copied file and its associated notes, highlights, bookmarks, and reading progress.
- If title or cover metadata is missing, use the filename as the title and display a simple generated cover using the filename.
- If an imported file is exactly the same as an existing library item, block the import.
