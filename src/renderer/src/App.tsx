import type { ReactElement, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppTheme,
  BookmarkSummary,
  CreateBookmarkInput,
  EpubReaderLocation,
  HighlightColor,
  HighlightSummary,
  LibraryBookSummary,
  LibraryImportResult,
  LibraryRemoveResult,
  PdfReaderLocation,
  ReaderLocation,
} from "../../shared/papercase-api";
import {
  defaultEpubFontSize,
  epubFontSizeStep,
  EpubReader,
  maxEpubFontSize,
  minEpubFontSize,
} from "./epub-reader";
import { PdfReader } from "./pdf-reader";
import type {
  ReaderContentsItem,
  ReaderNavigationTarget,
} from "./reader-types";

type Notice = {
  tone: "success" | "info" | "error";
  message: string;
} | null;

type ReaderStatus =
  | "loading"
  | "ready"
  | "not-found"
  | "missing-file"
  | "failed";

type ReaderPanel = "contents" | "bookmarks" | "highlights";

type EpubFontSizeControls = {
  canDecrease: boolean;
  canIncrease: boolean;
  fontSizePercent: number;
  onDecrease: () => void;
  onIncrease: () => void;
};

type ViewState =
  | {
      name: "library";
    }
  | {
      name: "reader";
      book: LibraryBookSummary;
      location: ReaderLocation;
      message: string | null;
      status: ReaderStatus;
    };

const themeOptions: Array<{ label: string; value: AppTheme }> = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

const highlightColorOptions: Array<{
  label: string;
  value: HighlightColor;
}> = [
  { label: "Yellow highlight", value: "yellow" },
  { label: "Green highlight", value: "green" },
  { label: "Blue highlight", value: "blue" },
  { label: "Rose highlight", value: "rose" },
];

function App(): ReactElement {
  const [version, setVersion] = useState<string | null>(null);
  const [books, setBooks] = useState<LibraryBookSummary[]>([]);
  const [view, setView] = useState<ViewState>({ name: "library" });
  const [theme, setTheme] = useState<AppTheme>("system");
  const [isLoadingBooks, setIsLoadingBooks] = useState(() =>
    Boolean(window.papercase),
  );
  const [isImporting, setIsImporting] = useState(false);
  const [pendingRemovalBookId, setPendingRemovalBookId] = useState<
    string | null
  >(null);
  const [openOptionsBookId, setOpenOptionsBookId] = useState<string | null>(
    null,
  );
  const [removingBookId, setRemovingBookId] = useState<string | null>(null);
  const [removeErrorMessage, setRemoveErrorMessage] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let isMounted = true;
    const api = window.papercase;

    api?.app
      .getVersion()
      .then((appVersion) => {
        if (isMounted) {
          setVersion(appVersion);
        }
      })
      .catch(() => {
        if (isMounted) {
          setVersion(null);
        }
      });

    api?.library
      .listBooks()
      .then((libraryBooks) => {
        if (isMounted) {
          setBooks(libraryBooks);
          setIsLoadingBooks(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setNotice({
            tone: "error",
            message: "The library could not be loaded.",
          });
          setIsLoadingBooks(false);
        }
      });

    api?.settings
      .getSettings()
      .then((settings) => {
        if (isMounted) {
          setTheme(settings.theme);
        }
      })
      .catch(() => {
        if (isMounted) {
          setTheme("system");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
      return;
    }

    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => {
        setNotice(null);
      },
      notice.tone === "error" ? 5200 : 3200,
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice]);

  async function handleImportBook(): Promise<void> {
    const api = window.papercase;

    if (!api || isImporting) {
      return;
    }

    setIsImporting(true);
    setNotice(null);
    setOpenOptionsBookId(null);

    try {
      const result = await api.library.importBook();
      await handleImportResult(result);
    } catch {
      setNotice({
        tone: "error",
        message:
          "The book could not be imported. Check the file and try again.",
      });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleImportResult(
    result: LibraryImportResult,
  ): Promise<void> {
    if (result.status === "canceled") {
      return;
    }

    if (result.status === "failed") {
      setNotice({
        tone: "error",
        message: result.message,
      });
      return;
    }

    const refreshedBooks = await window.papercase?.library.listBooks();

    if (refreshedBooks) {
      setBooks(refreshedBooks);
    }

    if (result.status === "duplicate") {
      setNotice({
        tone: "info",
        message: `Already in your library: ${result.book.title}.`,
      });
      return;
    }

    setNotice({
      tone: "success",
      message: `${result.book.title} was added to your library.`,
    });
  }

  function handleToggleBookOptions(bookId: string): void {
    setNotice(null);
    setOpenOptionsBookId((currentBookId) =>
      currentBookId === bookId ? null : bookId,
    );
  }

  function handleRequestRemoveBook(bookId: string): void {
    setNotice(null);
    setRemoveErrorMessage(null);
    setOpenOptionsBookId(null);
    setPendingRemovalBookId(bookId);
  }

  async function handleOpenBook(book: LibraryBookSummary): Promise<void> {
    const api = window.papercase;
    const openingView = readerViewForBook(book, "loading", null);

    setNotice(null);
    setOpenOptionsBookId(null);
    setPendingRemovalBookId(null);
    setView(openingView);

    if (!api) {
      setView(readerViewForBook(book, "ready", null));
      return;
    }

    try {
      const result = await api.library.openBook(book.id);

      if (result.status === "ready") {
        setView(readerViewForBook(book, "ready", null));
        return;
      }

      if (result.status === "not-found") {
        setBooks((currentBooks) =>
          currentBooks.filter((currentBook) => currentBook.id !== book.id),
        );
      }

      setView(readerViewForBook(book, result.status, result.message));
    } catch {
      setView(
        readerViewForBook(book, "failed", "The book could not be opened."),
      );
    }
  }

  function handleBackToLibrary(): void {
    setNotice(null);
    setView({ name: "library" });
  }

  async function handleThemeChange(nextTheme: AppTheme): Promise<void> {
    const api = window.papercase;
    const previousTheme = theme;

    if (nextTheme === theme) {
      return;
    }

    setTheme(nextTheme);

    if (!api) {
      return;
    }

    try {
      const result = await api.settings.updateSettings({ theme: nextTheme });

      if (result.status === "failed") {
        setTheme(previousTheme);
        setNotice({
          tone: "error",
          message: result.message,
        });
        return;
      }

      setTheme(result.settings.theme);
    } catch {
      setTheme(previousTheme);
      setNotice({
        tone: "error",
        message: "The setting could not be saved.",
      });
    }
  }

  function handleCancelRemoveBook(): void {
    if (removingBookId) {
      return;
    }

    setRemoveErrorMessage(null);
    setPendingRemovalBookId(null);
  }

  async function handleConfirmRemoveBook(
    book: LibraryBookSummary,
  ): Promise<void> {
    const api = window.papercase;

    if (!api || removingBookId) {
      return;
    }

    setRemovingBookId(book.id);
    setRemoveErrorMessage(null);
    setNotice(null);

    try {
      const result = await api.library.removeBook(book.id);
      handleRemoveResult(result, book);
    } catch {
      setRemoveErrorMessage(
        "The book could not be removed. Its local data was left in place.",
      );
    } finally {
      setRemovingBookId(null);
    }
  }

  function handleRemoveResult(
    result: LibraryRemoveResult,
    book: LibraryBookSummary,
  ): void {
    if (result.status === "failed") {
      setRemoveErrorMessage(result.message);
      return;
    }

    setBooks((currentBooks) =>
      currentBooks.filter((currentBook) => currentBook.id !== book.id),
    );
    setRemoveErrorMessage(null);
    setPendingRemovalBookId(null);

    if (result.status === "not-found") {
      setNotice({
        tone: "info",
        message: `${book.title} was already removed from your library.`,
      });
      return;
    }

    setNotice({
      tone: "success",
      message: `${book.title} was removed from your library.`,
    });
  }

  const bookCount = books.length;
  const bookCountLabel = `${bookCount} ${bookCount === 1 ? "book" : "books"}`;
  const pendingRemovalBook =
    pendingRemovalBookId === null
      ? null
      : (books.find((book) => book.id === pendingRemovalBookId) ?? null);

  if (view.name === "reader") {
    return (
      <>
        <ReaderShell
          key={view.book.id}
          theme={theme}
          view={view}
          onBack={handleBackToLibrary}
          onThemeChange={handleThemeChange}
        />
        <NoticeToast notice={notice} />
      </>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Library navigation">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <div>
            <p className="brand-name">Papercase</p>
            <p className="brand-subtitle">Local library</p>
          </div>
        </div>

        <nav className="nav-list">
          <a className="nav-item is-active" href="#library">
            Library
          </a>
        </nav>

        <p className="sidebar-meta">{version ? `v${version}` : "Foundation"}</p>
      </aside>

      <section className="library-view" id="library">
        <div className="library-window-drag-strip" aria-hidden="true" />
        <header className="library-header">
          <div>
            <p className="section-kicker">Library</p>
            <h1>Reading desk</h1>
          </div>
          <div className="library-actions">
            <span className="book-count">{bookCountLabel}</span>
            <button
              className="import-button"
              type="button"
              onClick={handleImportBook}
              disabled={isImporting}
            >
              <span aria-hidden="true">+</span>
              {isImporting ? "Importing" : "Import"}
            </button>
          </div>
        </header>

        <NoticeToast notice={notice} />

        {isLoadingBooks ? (
          <section className="empty-state" aria-label="Loading library">
            <div className="empty-cover" aria-hidden="true">
              <span>PC</span>
            </div>
            <div className="empty-copy">
              <h2>Loading library</h2>
              <p>One moment while Papercase opens the local shelf.</p>
            </div>
          </section>
        ) : books.length === 0 ? (
          <section
            className="empty-state"
            aria-labelledby="empty-library-title"
          >
            <div className="empty-cover" aria-hidden="true">
              <span>PC</span>
            </div>
            <div className="empty-copy">
              <h2 id="empty-library-title">No books yet</h2>
              <p>Imported EPUBs and PDFs will appear here.</p>
            </div>
          </section>
        ) : (
          <section className="book-grid" aria-label="Imported books">
            {books.map((book) => (
              <BookCard
                book={book}
                isOptionsOpen={openOptionsBookId === book.id}
                key={book.id}
                onOpen={handleOpenBook}
                onRequestRemove={handleRequestRemoveBook}
                onToggleOptions={handleToggleBookOptions}
              />
            ))}
          </section>
        )}
      </section>

      {pendingRemovalBook ? (
        <RemoveBookDialog
          book={pendingRemovalBook}
          errorMessage={removeErrorMessage}
          isRemoving={removingBookId === pendingRemovalBook.id}
          onCancel={handleCancelRemoveBook}
          onConfirm={handleConfirmRemoveBook}
        />
      ) : null}
    </main>
  );
}

function NoticeToast({ notice }: { notice: Notice }): ReactElement | null {
  if (!notice) {
    return null;
  }

  return (
    <p className={`notice is-${notice.tone}`} role="status">
      {notice.message}
    </p>
  );
}

function ReaderShell({
  theme,
  view,
  onBack,
  onThemeChange,
}: {
  theme: AppTheme;
  view: Extract<ViewState, { name: "reader" }>;
  onBack: () => void;
  onThemeChange: (theme: AppTheme) => void;
}): ReactElement {
  const floatingControlsRef = useRef<HTMLDivElement | null>(null);
  const readerPanelRef = useRef<HTMLElement | null>(null);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [activeReaderPanel, setActiveReaderPanel] =
    useState<ReaderPanel | null>(null);
  const [readerLocation, setReaderLocation] = useState(view.location);
  const [readerContents, setReaderContents] = useState<ReaderContentsItem[]>(
    [],
  );
  const [bookmarks, setBookmarks] = useState<BookmarkSummary[]>([]);
  const [bookmarkErrorMessage, setBookmarkErrorMessage] = useState<
    string | null
  >(null);
  const [highlights, setHighlights] = useState<HighlightSummary[]>([]);
  const [highlightErrorMessage, setHighlightErrorMessage] = useState<
    string | null
  >(null);
  const [editingHighlightId, setEditingHighlightId] = useState<string | null>(
    null,
  );
  const [isBookmarkingLocation, setIsBookmarkingLocation] = useState(false);
  const [deletingBookmarkId, setDeletingBookmarkId] = useState<string | null>(
    null,
  );
  const [savingHighlightId, setSavingHighlightId] = useState<string | null>(
    null,
  );
  const [deletingHighlightId, setDeletingHighlightId] = useState<string | null>(
    null,
  );
  const [epubFontSizePercent, setEpubFontSizePercent] =
    useState(defaultEpubFontSize);
  const pageNavigationRef = useRef<
    ((target: ReaderNavigationTarget) => void) | null
  >(null);
  const locationLabel = readerLocationLabel(view, readerLocation);
  const currentBookmarkKey = bookmarkLocationKey(readerLocation);
  const currentBookmark =
    currentBookmarkKey === null
      ? null
      : (bookmarks.find(
          (bookmark) => bookmarkSummaryKey(bookmark) === currentBookmarkKey,
        ) ?? null);
  const canBookmarkCurrentLocation =
    view.status === "ready" && currentBookmarkKey !== null;

  const handleReaderLocationChange = useCallback((location: ReaderLocation) => {
    setReaderLocation(location);
  }, []);

  const handleReaderContentsChange = useCallback(
    (contents: ReaderContentsItem[]) => {
      setReaderContents(contents);
    },
    [],
  );
  const handleEpubFontSizeChange = useCallback((fontSizePercent: number) => {
    setEpubFontSizePercent(clampEpubFontSize(fontSizePercent));
  }, []);

  useEffect(() => {
    let isMounted = true;
    const api = window.papercase?.bookmarks;

    if (view.status !== "ready") {
      return;
    }

    if (!api) {
      return;
    }

    api
      .listBookmarks(view.book.id)
      .then((result) => {
        if (!isMounted) {
          return;
        }

        if (result.status === "failed") {
          setBookmarkErrorMessage(result.message);
          setBookmarks([]);
          return;
        }

        setBookmarks(result.bookmarks);
      })
      .catch(() => {
        if (isMounted) {
          setBookmarkErrorMessage("Bookmarks could not be loaded.");
          setBookmarks([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [view.book.id, view.status]);

  useEffect(() => {
    let isMounted = true;
    const api = window.papercase?.highlights;

    if (view.status !== "ready") {
      return;
    }

    if (!api) {
      return;
    }

    api
      .listHighlights(view.book.id)
      .then((result) => {
        if (!isMounted) {
          return;
        }

        if (result.status === "failed") {
          setHighlightErrorMessage(result.message);
          setHighlights([]);
          return;
        }

        setHighlightErrorMessage(null);
        setHighlights(result.highlights);
      })
      .catch(() => {
        if (isMounted) {
          setHighlightErrorMessage("Highlights could not be loaded.");
          setHighlights([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [view.book.id, view.status]);

  useEffect(() => {
    if (!activeReaderPanel) {
      return;
    }

    function handlePointerDown(event: Event): void {
      if (!(event.target instanceof Node)) {
        setActiveReaderPanel(null);
        return;
      }

      if (
        readerPanelRef.current?.contains(event.target) ||
        floatingControlsRef.current?.contains(event.target)
      ) {
        return;
      }

      setActiveReaderPanel(null);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setActiveReaderPanel(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("papercase:reader-interaction", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(
        "papercase:reader-interaction",
        handlePointerDown,
      );
    };
  }, [activeReaderPanel]);

  function handleThemeMenuChange(nextTheme: AppTheme): void {
    onThemeChange(nextTheme);
    setIsOptionsOpen(false);
  }

  function handleReaderPanelSelect(panel: ReaderPanel): void {
    setActiveReaderPanel((currentPanel) =>
      currentPanel === panel ? null : panel,
    );
  }

  function handleReaderContentSelect(item: ReaderContentsItem): void {
    if (item.target === null) {
      return;
    }

    pageNavigationRef.current?.(item.target);
    setActiveReaderPanel(null);
  }

  async function handleBookmarkCurrentLocation(): Promise<void> {
    const api = window.papercase?.bookmarks;
    const input = createBookmarkInputFromReaderLocation(readerLocation);

    if (!api || !input || isBookmarkingLocation) {
      return;
    }

    setBookmarkErrorMessage(null);
    setIsBookmarkingLocation(true);

    try {
      if (currentBookmark) {
        const didDelete = await deleteBookmark(api, currentBookmark.id);

        if (didDelete) {
          setBookmarks((currentBookmarks) =>
            currentBookmarks.filter(
              (bookmark) => bookmark.id !== currentBookmark.id,
            ),
          );
        }

        return;
      }

      const result = await api.createBookmark(input);

      if (result.status === "failed") {
        setBookmarkErrorMessage(result.message);
        setActiveReaderPanel("bookmarks");
        return;
      }

      const nextBookmarkKey = bookmarkSummaryKey(result.bookmark);

      setBookmarks((currentBookmarks) => [
        result.bookmark,
        ...currentBookmarks.filter(
          (bookmark) => bookmarkSummaryKey(bookmark) !== nextBookmarkKey,
        ),
      ]);
    } catch {
      setBookmarkErrorMessage("The bookmark could not be saved.");
      setActiveReaderPanel("bookmarks");
    } finally {
      setIsBookmarkingLocation(false);
    }
  }

  async function handleBookmarkDelete(bookmarkId: string): Promise<void> {
    const api = window.papercase?.bookmarks;

    if (!api || deletingBookmarkId) {
      return;
    }

    setBookmarkErrorMessage(null);
    setDeletingBookmarkId(bookmarkId);

    try {
      const didDelete = await deleteBookmark(api, bookmarkId);

      if (didDelete) {
        setBookmarks((currentBookmarks) =>
          currentBookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
        );
      }
    } finally {
      setDeletingBookmarkId(null);
    }
  }

  async function deleteBookmark(
    api: NonNullable<typeof window.papercase>["bookmarks"],
    bookmarkId: string,
  ): Promise<boolean> {
    try {
      const result = await api.deleteBookmark({
        bookId: view.book.id,
        bookmarkId,
      });

      if (result.status === "failed") {
        setBookmarkErrorMessage(result.message);
        setActiveReaderPanel("bookmarks");
        return false;
      }

      return true;
    } catch {
      setBookmarkErrorMessage("The bookmark could not be deleted.");
      setActiveReaderPanel("bookmarks");
      return false;
    }
  }

  function handleBookmarkSelect(bookmark: BookmarkSummary): void {
    pageNavigationRef.current?.(bookmarkNavigationTarget(bookmark));
    setActiveReaderPanel(null);
  }

  function handleHighlightSelect(highlightId: string): void {
    setHighlightErrorMessage(null);
    setEditingHighlightId((currentHighlightId) =>
      currentHighlightId === highlightId ? null : highlightId,
    );
  }

  async function handleHighlightColorChange(
    highlightId: string,
    color: HighlightColor,
  ): Promise<void> {
    await updateHighlight(highlightId, { color });
  }

  async function handleHighlightNoteSave(
    highlightId: string,
    note: string | null,
  ): Promise<void> {
    await updateHighlight(highlightId, { note });
  }

  async function updateHighlight(
    highlightId: string,
    update: {
      color?: HighlightColor;
      note?: string | null;
    },
  ): Promise<void> {
    const api = window.papercase?.highlights;

    if (!api || savingHighlightId) {
      return;
    }

    setHighlightErrorMessage(null);
    setSavingHighlightId(highlightId);

    try {
      const result = await api.updateHighlight({
        bookId: view.book.id,
        highlightId,
        ...update,
      });

      if (result.status === "failed") {
        setHighlightErrorMessage(result.message);
        setActiveReaderPanel("highlights");
        return;
      }

      if (result.status === "not-found") {
        setHighlights((currentHighlights) =>
          currentHighlights.filter((highlight) => highlight.id !== highlightId),
        );
        setEditingHighlightId(null);
        return;
      }

      setHighlights((currentHighlights) =>
        currentHighlights.map((highlight) =>
          highlight.id === result.highlight.id ? result.highlight : highlight,
        ),
      );
    } catch {
      setHighlightErrorMessage("The highlight could not be updated.");
      setActiveReaderPanel("highlights");
    } finally {
      setSavingHighlightId(null);
    }
  }

  async function handleHighlightDelete(highlightId: string): Promise<void> {
    const api = window.papercase?.highlights;

    if (!api || deletingHighlightId) {
      return;
    }

    setHighlightErrorMessage(null);
    setDeletingHighlightId(highlightId);

    try {
      const result = await api.deleteHighlight({
        bookId: view.book.id,
        highlightId,
      });

      if (result.status === "failed") {
        setHighlightErrorMessage(result.message);
        setActiveReaderPanel("highlights");
        return;
      }

      setHighlights((currentHighlights) =>
        currentHighlights.filter((highlight) => highlight.id !== highlightId),
      );
      setEditingHighlightId((currentHighlightId) =>
        currentHighlightId === highlightId ? null : currentHighlightId,
      );
    } catch {
      setHighlightErrorMessage("The highlight could not be deleted.");
      setActiveReaderPanel("highlights");
    } finally {
      setDeletingHighlightId(null);
    }
  }

  function changeEpubFontSize(delta: number): void {
    setEpubFontSizePercent((currentFontSize) =>
      clampEpubFontSize(currentFontSize + delta),
    );
  }

  const epubFontSizeControls: EpubFontSizeControls | null =
    view.book.format === "epub"
      ? {
          canDecrease: epubFontSizePercent > minEpubFontSize,
          canIncrease: epubFontSizePercent < maxEpubFontSize,
          fontSizePercent: epubFontSizePercent,
          onDecrease: () => changeEpubFontSize(-epubFontSizeStep),
          onIncrease: () => changeEpubFontSize(epubFontSizeStep),
        }
      : null;

  return (
    <main className="reader-shell" aria-label="Reader">
      <div className="reader-chrome">
        <header className="reader-toolbar">
          <div className="reader-toolbar-primary">
            <button
              aria-label="Back to library"
              className="reader-back-button"
              title="Back to library"
              type="button"
              onClick={onBack}
            >
              <ChevronLeftIcon />
            </button>
            <div className="reader-title-group">
              <p className="section-kicker">{view.book.format.toUpperCase()}</p>
              <h1>{view.book.title}</h1>
            </div>
          </div>

          <div className="reader-toolbar-secondary">
            {view.book.format === "pdf" ? (
              <p className="reader-location">{locationLabel}</p>
            ) : null}
            <button
              aria-label={
                currentBookmark
                  ? "Remove bookmark at current location"
                  : "Add bookmark at current location"
              }
              aria-pressed={Boolean(currentBookmark)}
              className={`reader-bookmark-button${
                currentBookmark ? " is-active" : ""
              }`}
              disabled={!canBookmarkCurrentLocation || isBookmarkingLocation}
              title={currentBookmark ? "Remove bookmark" : "Add bookmark"}
              type="button"
              onClick={handleBookmarkCurrentLocation}
            >
              <BookmarkPageIcon filled={Boolean(currentBookmark)} />
            </button>
            <ReaderOptionsMenu
              epubFontSizeControls={epubFontSizeControls}
              isOpen={isOptionsOpen}
              theme={theme}
              onOpenChange={setIsOptionsOpen}
              onThemeChange={handleThemeMenuChange}
            />
          </div>
        </header>

        <FloatingReaderControls
          activePanel={activeReaderPanel}
          controlsRef={floatingControlsRef}
          onSelectPanel={handleReaderPanelSelect}
        />
      </div>

      <div
        className={`reader-layout${
          activeReaderPanel ? " has-reader-panel" : ""
        }`}
      >
        {activeReaderPanel ? (
          <aside
            className="reader-panel"
            aria-label={readerPanelLabel(activeReaderPanel)}
            ref={readerPanelRef}
          >
            <ReaderPanelContent
              activePanel={activeReaderPanel}
              bookmarkErrorMessage={bookmarkErrorMessage}
              bookmarks={bookmarks}
              contents={readerContents}
              deletingBookmarkId={deletingBookmarkId}
              deletingHighlightId={deletingHighlightId}
              editingHighlightId={editingHighlightId}
              highlightErrorMessage={highlightErrorMessage}
              highlights={highlights}
              locationLabel={locationLabel}
              savingHighlightId={savingHighlightId}
              onClose={() => setActiveReaderPanel(null)}
              onDeleteBookmark={handleBookmarkDelete}
              onDeleteHighlight={handleHighlightDelete}
              onHighlightColorChange={handleHighlightColorChange}
              onHighlightNoteSave={handleHighlightNoteSave}
              onSelectHighlight={handleHighlightSelect}
              onSelectBookmark={handleBookmarkSelect}
              onSelectContent={handleReaderContentSelect}
            />
          </aside>
        ) : null}

        <div className="reader-stage-wrap">
          {view.status === "ready" ? (
            <ReaderStage
              book={view.book}
              epubFontSizePercent={epubFontSizePercent}
              theme={theme}
              onContentsChange={handleReaderContentsChange}
              onEpubFontSizeChange={handleEpubFontSizeChange}
              onLocationChange={handleReaderLocationChange}
              pageNavigationRef={pageNavigationRef}
            />
          ) : (
            <ReaderStatusStage view={view} />
          )}
        </div>
      </div>
    </main>
  );
}

function FloatingReaderControls({
  activePanel,
  controlsRef,
  onSelectPanel,
}: {
  activePanel: ReaderPanel | null;
  controlsRef: RefObject<HTMLDivElement | null>;
  onSelectPanel: (panel: ReaderPanel) => void;
}): ReactElement {
  return (
    <div
      className="reader-floating-controls"
      ref={controlsRef}
      aria-label="Reader panels"
    >
      <div className="reader-floating-button-set">
        <button
          aria-label={
            activePanel === "contents"
              ? "Hide table of contents"
              : "Show table of contents"
          }
          aria-pressed={activePanel === "contents"}
          className="reader-floating-button"
          title="Table of contents"
          type="button"
          onClick={() => onSelectPanel("contents")}
        >
          <ListIcon />
        </button>
        <button
          aria-label={
            activePanel === "bookmarks" ? "Hide bookmarks" : "Show bookmarks"
          }
          aria-pressed={activePanel === "bookmarks"}
          className="reader-floating-button"
          title="Bookmarks"
          type="button"
          onClick={() => onSelectPanel("bookmarks")}
        >
          <BookmarkPageIcon />
        </button>
        <button
          aria-label={
            activePanel === "highlights"
              ? "Hide highlights and notes"
              : "Show highlights and notes"
          }
          aria-pressed={activePanel === "highlights"}
          className="reader-floating-button"
          title="Highlights and notes"
          type="button"
          onClick={() => onSelectPanel("highlights")}
        >
          <HighlighterIcon />
        </button>
      </div>
    </div>
  );
}

function ReaderPanelContent({
  activePanel,
  bookmarkErrorMessage,
  bookmarks,
  contents,
  deletingBookmarkId,
  deletingHighlightId,
  editingHighlightId,
  highlightErrorMessage,
  highlights,
  locationLabel,
  savingHighlightId,
  onClose,
  onDeleteBookmark,
  onDeleteHighlight,
  onHighlightColorChange,
  onHighlightNoteSave,
  onSelectHighlight,
  onSelectBookmark,
  onSelectContent,
}: {
  activePanel: ReaderPanel;
  bookmarkErrorMessage: string | null;
  bookmarks: BookmarkSummary[];
  contents: ReaderContentsItem[];
  deletingBookmarkId: string | null;
  deletingHighlightId: string | null;
  editingHighlightId: string | null;
  highlightErrorMessage: string | null;
  highlights: HighlightSummary[];
  locationLabel: string;
  savingHighlightId: string | null;
  onClose: () => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  onDeleteHighlight: (highlightId: string) => void;
  onHighlightColorChange: (
    highlightId: string,
    color: HighlightColor,
  ) => void;
  onHighlightNoteSave: (highlightId: string, note: string | null) => void;
  onSelectHighlight: (highlightId: string) => void;
  onSelectBookmark: (bookmark: BookmarkSummary) => void;
  onSelectContent: (item: ReaderContentsItem) => void;
}): ReactElement {
  if (activePanel === "contents") {
    return (
      <section className="reader-panel-section">
        <h2>Table of contents</h2>
        {contents.length > 0 ? (
          <nav aria-label="Table of contents">
            {contents.map((item) => (
              <button
                className={`reader-toc-link level-${Math.min(item.level, 4)}`}
                disabled={item.target === null}
                key={item.id}
                type="button"
                onClick={() => onSelectContent(item)}
              >
                <span>{item.title}</span>
                <span aria-hidden="true">{item.label ?? "-"}</span>
              </button>
            ))}
          </nav>
        ) : (
          <p>No table of contents in this book.</p>
        )}
        <button className="reader-toc-current" type="button" onClick={onClose}>
          {locationLabel}
        </button>
      </section>
    );
  }

  if (activePanel === "bookmarks") {
    return (
      <section className="reader-panel-section">
        <h2>Bookmarks</h2>
        {bookmarkErrorMessage ? (
          <p className="reader-panel-error" role="alert">
            {bookmarkErrorMessage}
          </p>
        ) : null}
        {bookmarks.length === 0 ? <p>No bookmarks yet.</p> : null}
        {bookmarks.length > 0 ? (
          <div className="reader-bookmark-list">
            {bookmarks.map((bookmark) => (
              <div className="reader-bookmark-row" key={bookmark.id}>
                <button
                  className="reader-bookmark-jump"
                  type="button"
                  onClick={() => onSelectBookmark(bookmark)}
                >
                  <span>{bookmarkDisplayLabel(bookmark)}</span>
                  <span>{formatBookmarkDate(bookmark.createdAt)}</span>
                </button>
                <button
                  aria-label={`Delete bookmark ${bookmarkDisplayLabel(
                    bookmark,
                  )}`}
                  className="reader-bookmark-delete"
                  disabled={deletingBookmarkId === bookmark.id}
                  title="Delete bookmark"
                  type="button"
                  onClick={() => onDeleteBookmark(bookmark.id)}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="reader-panel-section">
      <h2>Highlights and notes</h2>
      {highlightErrorMessage ? (
        <p className="reader-panel-error" role="alert">
          {highlightErrorMessage}
        </p>
      ) : null}
      {highlights.length === 0 ? <p>No highlights or notes yet.</p> : null}
      {highlights.length > 0 ? (
        <div className="reader-highlight-list">
          {highlights.map((highlight) => (
            <article className="reader-highlight-row" key={highlight.id}>
              <button
                aria-expanded={editingHighlightId === highlight.id}
                aria-label={`Edit highlight ${highlightPreviewText(
                  highlight.selectedText,
                )}`}
                className="reader-highlight-jump"
                type="button"
                onClick={() => onSelectHighlight(highlight.id)}
              >
                <span
                  aria-hidden="true"
                  className={`reader-highlight-swatch is-${highlight.color}`}
                />
                <span className="reader-highlight-copy">
                  <span>{highlightPreviewText(highlight.selectedText)}</span>
                  <span>
                    {highlight.note
                      ? highlight.note
                      : formatHighlightDate(highlight.createdAt)}
                  </span>
                </span>
              </button>

              {editingHighlightId === highlight.id ? (
                <HighlightSelectionPopup
                  color={highlight.color}
                  deleting={deletingHighlightId === highlight.id}
                  note={highlight.note}
                  saving={savingHighlightId === highlight.id}
                  selectedText={highlight.selectedText}
                  onColorChange={(color) =>
                    onHighlightColorChange(highlight.id, color)
                  }
                  onDelete={() => onDeleteHighlight(highlight.id)}
                  onNoteSave={(note) =>
                    onHighlightNoteSave(highlight.id, note)
                  }
                />
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function HighlightSelectionPopup({
  color,
  deleting,
  note,
  saving,
  selectedText,
  onColorChange,
  onDelete,
  onNoteSave,
}: {
  color: HighlightColor;
  deleting: boolean;
  note: string | null;
  saving: boolean;
  selectedText: string;
  onColorChange: (color: HighlightColor) => void;
  onDelete: () => void;
  onNoteSave: (note: string | null) => void;
}): ReactElement {
  const [draftNote, setDraftNote] = useState(note ?? "");

  function handleNoteSave(): void {
    const trimmedNote = draftNote.trim();
    onNoteSave(trimmedNote.length > 0 ? trimmedNote : null);
  }

  return (
    <section
      aria-label="Highlight actions"
      className="reader-selection-popup"
      role="dialog"
    >
      <p className="reader-selection-text">
        {highlightPreviewText(selectedText)}
      </p>
      <div className="reader-highlight-color-list" aria-label="Highlight color">
        {highlightColorOptions.map((option) => (
          <button
            aria-label={option.label}
            aria-pressed={color === option.value}
            className={`reader-highlight-color-button is-${option.value}${
              color === option.value ? " is-selected" : ""
            }`}
            disabled={saving || deleting}
            key={option.value}
            title={option.label}
            type="button"
            onClick={() => onColorChange(option.value)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      <label className="reader-highlight-note-field">
        <span>Note</span>
        <textarea
          rows={3}
          value={draftNote}
          placeholder="Add a note"
          disabled={saving || deleting}
          onChange={(event) => setDraftNote(event.target.value)}
        />
      </label>
      <div className="reader-selection-popup-actions">
        <button
          className="secondary-button"
          disabled={saving || deleting}
          type="button"
          onClick={handleNoteSave}
        >
          {saving ? "Saving" : "Save note"}
        </button>
        <button
          className="reader-selection-delete"
          disabled={saving || deleting}
          type="button"
          onClick={onDelete}
        >
          {deleting ? "Deleting" : "Delete"}
        </button>
      </div>
    </section>
  );
}

function ReaderOptionsMenu({
  epubFontSizeControls,
  isOpen,
  theme,
  onOpenChange,
  onThemeChange,
}: {
  epubFontSizeControls: EpubFontSizeControls | null;
  isOpen: boolean;
  theme: AppTheme;
  onOpenChange: (isOpen: boolean) => void;
  onThemeChange: (theme: AppTheme) => void;
}): ReactElement {
  const optionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: Event): void {
      if (
        !(event.target instanceof Node) ||
        !optionsRef.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("papercase:reader-interaction", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(
        "papercase:reader-interaction",
        handlePointerDown,
      );
    };
  }, [isOpen, onOpenChange]);

  return (
    <div className="reader-options" ref={optionsRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Reader options"
        className="reader-options-button"
        title="Reader options"
        type="button"
        onClick={() => onOpenChange(!isOpen)}
      >
        <GearIcon />
      </button>

      {isOpen ? (
        <section
          aria-label="Reader options"
          className="reader-options-popover"
          role="menu"
        >
          <div className="reader-options-section">
            <p className="reader-options-heading">Theme</p>
            <div className="reader-theme-list">
              {themeOptions.map((option) => (
                <button
                  aria-checked={theme === option.value}
                  className="reader-theme-item"
                  key={option.value}
                  role="menuitemradio"
                  type="button"
                  onClick={() => onThemeChange(option.value)}
                >
                  <span
                    aria-hidden="true"
                    className={`reader-theme-check${
                      theme === option.value ? " is-selected" : ""
                    }`}
                  />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {epubFontSizeControls ? (
            <div className="reader-options-section">
              <p className="reader-options-heading">EPUB text</p>
              <div className="reader-font-size-control">
                <button
                  aria-label="Decrease EPUB font size"
                  className="reader-font-size-button"
                  disabled={!epubFontSizeControls.canDecrease}
                  role="menuitem"
                  type="button"
                  onClick={epubFontSizeControls.onDecrease}
                >
                  A-
                </button>
                <span className="reader-font-size-value">
                  {epubFontSizeControls.fontSizePercent}%
                </span>
                <button
                  aria-label="Increase EPUB font size"
                  className="reader-font-size-button"
                  disabled={!epubFontSizeControls.canIncrease}
                  role="menuitem"
                  type="button"
                  onClick={epubFontSizeControls.onIncrease}
                >
                  A+
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ListIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path
        d="M8 5h8M8 10h8M8 15h8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
      <path
        d="M4 5h.1M4 10h.1M4 15h.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
    </svg>
  );
}

function BookmarkPageIcon({
  filled = false,
}: {
  filled?: boolean;
}): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path
        d="M6 3.2h8a1 1 0 0 1 1 1v12.1l-5-2.8-5 2.8V4.2a1 1 0 0 1 1-1Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function TrashIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path
        d="M4.8 6.1h10.4M8.1 6.1V4.4h3.8v1.7M7 8.4v5.3M10 8.4v5.3M13 8.4v5.3M6.2 6.1l.5 10h6.6l.5-10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.55"
      />
    </svg>
  );
}

function HighlighterIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path
        d="m12.9 3.3 3.8 3.8-7.2 7.2-4.2 1.1 1.1-4.2 6.5-7.9Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.45"
      />
      <path
        d="m11.5 5.1 3.4 3.4M4 17h11"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.55"
      />
    </svg>
  );
}

function ChevronLeftIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path
        d="M12.4 4.2 6.6 10l5.8 5.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function GearIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path
        d="M10 7.1a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m10.6 2.4.5 1.7c.5.1.9.3 1.3.5l1.6-.8 1.2 1.2-.8 1.6c.2.4.4.9.5 1.3l1.7.5v1.8l-1.7.5c-.1.5-.3.9-.5 1.3l.8 1.6-1.2 1.2-1.6-.8c-.4.2-.9.4-1.3.5l-.5 1.7H8.8l-.5-1.7c-.5-.1-.9-.3-1.3-.5l-1.6.8-1.2-1.2.8-1.6c-.2-.4-.4-.9-.5-1.3l-1.7-.5V8.4l1.7-.5c.1-.5.3-.9.5-1.3l-.8-1.6 1.2-1.2 1.6.8c.4-.2.9-.4 1.3-.5l.5-1.7h1.8Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ReaderStage({
  book,
  epubFontSizePercent,
  theme,
  onContentsChange,
  onEpubFontSizeChange,
  onLocationChange,
  pageNavigationRef,
}: {
  book: LibraryBookSummary;
  epubFontSizePercent: number;
  theme: AppTheme;
  onContentsChange: (contents: ReaderContentsItem[]) => void;
  onEpubFontSizeChange: (fontSizePercent: number) => void;
  onLocationChange: (location: ReaderLocation) => void;
  pageNavigationRef: RefObject<
    ((target: ReaderNavigationTarget) => void) | null
  >;
}): ReactElement {
  if (book.format === "pdf") {
    return (
      <section
        className="reader-stage reader-stage-pdf"
        id="reader-start"
        aria-label="Reader area"
      >
        <PdfReader
          book={book}
          onContentsChange={onContentsChange}
          onLocationChange={onLocationChange}
          pageNavigationRef={pageNavigationRef}
        />
      </section>
    );
  }

  return (
    <section
      className="reader-stage reader-stage-epub"
      id="reader-start"
      aria-label="Reader area"
    >
      <EpubReader
        book={book}
        fontSizePercent={epubFontSizePercent}
        theme={theme}
        onContentsChange={onContentsChange}
        onFontSizeChange={onEpubFontSizeChange}
        onLocationChange={onLocationChange}
        pageNavigationRef={pageNavigationRef}
      />
    </section>
  );
}

function ReaderStatusStage({
  view,
}: {
  view: Extract<ViewState, { name: "reader" }>;
}): ReactElement {
  const statusTitle = readerStatusTitle(view.status);
  const isLoading = view.status === "loading";

  return (
    <section
      aria-busy={isLoading}
      aria-label="Reader status"
      className="reader-stage reader-stage-status"
    >
      <div
        className="reader-status-panel"
        role={isLoading ? "status" : "alert"}
      >
        <p className="dialog-kicker">{view.book.format.toUpperCase()}</p>
        <h2>{statusTitle}</h2>
        {view.message ? <p>{view.message}</p> : null}
      </div>
    </section>
  );
}

function BookCard({
  book,
  isOptionsOpen,
  onOpen,
  onRequestRemove,
  onToggleOptions,
}: {
  book: LibraryBookSummary;
  isOptionsOpen: boolean;
  onOpen: (book: LibraryBookSummary) => void;
  onRequestRemove: (bookId: string) => void;
  onToggleOptions: (bookId: string) => void;
}): ReactElement {
  return (
    <article className="book-card">
      <button
        aria-label={`Open ${book.title}`}
        className="book-open-button"
        type="button"
        onClick={() => onOpen(book)}
      >
        <div className="book-card-top">
          <div
            className={`book-cover tone-${coverTone(book.id)}`}
            aria-hidden="true"
          >
            <span className="book-cover-title">{coverTitle(book.title)}</span>
            <span className="book-cover-format">
              {book.format.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="book-details">
          <h2>{book.title}</h2>
          <p className="book-byline">
            {book.format.toUpperCase()} / {formatFileSize(book.fileSize)}
          </p>
          <p className="book-progress">{formatProgress(book)}</p>
        </div>
      </button>
      <div className="book-options">
        <button
          aria-expanded={isOptionsOpen}
          aria-haspopup="menu"
          aria-label={`More options for ${book.title}`}
          className="book-options-button"
          title="More options"
          type="button"
          onClick={() => onToggleOptions(book.id)}
        >
          <span aria-hidden="true">...</span>
        </button>
        {isOptionsOpen ? (
          <div
            aria-label={`Options for ${book.title}`}
            className="book-options-menu"
            role="menu"
          >
            <button
              aria-label={`Remove ${book.title}`}
              className="book-options-item"
              role="menuitem"
              type="button"
              onClick={() => onRequestRemove(book.id)}
            >
              Remove...
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function RemoveBookDialog({
  book,
  errorMessage,
  isRemoving,
  onCancel,
  onConfirm,
}: {
  book: LibraryBookSummary;
  errorMessage: string | null;
  isRemoving: boolean;
  onCancel: () => void;
  onConfirm: (book: LibraryBookSummary) => void;
}): ReactElement {
  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="remove-dialog-title"
        aria-modal="true"
        className="remove-dialog"
        role="dialog"
      >
        <p className="dialog-kicker">Remove book</p>
        <h2 id="remove-dialog-title">Remove {book.title}?</h2>
        <p>
          This deletes the local copy, reading progress, highlights, notes, and
          bookmarks from Papercase.
        </p>
        {errorMessage ? (
          <p className="remove-dialog-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="remove-dialog-actions">
          <button
            aria-label={`Remove ${book.title} from library`}
            className="danger-button"
            type="button"
            disabled={isRemoving}
            onClick={() => onConfirm(book)}
          >
            {isRemoving ? "Removing" : "Remove"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={isRemoving}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

function readerViewForBook(
  book: LibraryBookSummary,
  status: ReaderStatus,
  message: string | null,
): Extract<ViewState, { name: "reader" }> {
  return {
    name: "reader",
    book,
    location: readerLocationFromBook(book),
    message,
    status,
  };
}

function readerLocationFromBook(book: LibraryBookSummary): ReaderLocation {
  const label = book.progress ? formatProgress(book) : "Start";

  return {
    bookId: book.id,
    format: book.format,
    label,
    location: {
      kind: book.progress ? "saved-progress" : "start",
    },
  };
}

function readerLocationLabel(
  view: Extract<ViewState, { name: "reader" }>,
  location: ReaderLocation,
): string {
  if (view.status === "loading") {
    return "Opening";
  }

  if (view.status === "not-found" || view.status === "missing-file") {
    return "Unavailable";
  }

  if (view.status === "failed") {
    return "Unable to open";
  }

  return location.label ?? "Start";
}

function createBookmarkInputFromReaderLocation(
  readerLocation: ReaderLocation,
): CreateBookmarkInput | null {
  const label = readerLocation.label?.trim() || null;

  if (
    readerLocation.format === "pdf" &&
    isPdfReaderLocation(readerLocation.location)
  ) {
    return {
      bookId: readerLocation.bookId,
      format: "pdf",
      location: readerLocation.location,
      label,
    };
  }

  if (
    readerLocation.format === "epub" &&
    isEpubReaderLocation(readerLocation.location)
  ) {
    return {
      bookId: readerLocation.bookId,
      format: "epub",
      location: readerLocation.location,
      label,
    };
  }

  return null;
}

function bookmarkLocationKey(readerLocation: ReaderLocation): string | null {
  if (
    readerLocation.format === "pdf" &&
    isPdfReaderLocation(readerLocation.location)
  ) {
    return `pdf:${readerLocation.location.pageNumber}`;
  }

  if (
    readerLocation.format === "epub" &&
    isEpubReaderLocation(readerLocation.location)
  ) {
    return `epub:${readerLocation.location.cfi}`;
  }

  return null;
}

function bookmarkSummaryKey(bookmark: BookmarkSummary): string {
  return bookmark.format === "pdf"
    ? `pdf:${bookmark.location.pageNumber}`
    : `epub:${bookmark.location.cfi}`;
}

function bookmarkNavigationTarget(
  bookmark: BookmarkSummary,
): ReaderNavigationTarget {
  return bookmark.format === "pdf"
    ? bookmark.location.pageNumber
    : bookmark.location.cfi;
}

function bookmarkDisplayLabel(bookmark: BookmarkSummary): string {
  if (bookmark.label && bookmark.label.trim().length > 0) {
    return bookmark.label;
  }

  if (bookmark.format === "pdf") {
    return `Page ${bookmark.location.pageNumber}`;
  }

  return bookmark.location.chapterTitle ?? "EPUB bookmark";
}

function highlightPreviewText(selectedText: string): string {
  return selectedText.replace(/\s+/g, " ").trim();
}

function formatHighlightDate(createdAt: string): string {
  return formatBookmarkDate(createdAt);
}

function formatBookmarkDate(createdAt: string): string {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "Saved";
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function isPdfReaderLocation(location: unknown): location is PdfReaderLocation {
  if (!isObject(location)) {
    return false;
  }

  return (
    typeof location.pageNumber === "number" &&
    Number.isInteger(location.pageNumber) &&
    location.pageNumber > 0 &&
    typeof location.pageCount === "number" &&
    Number.isInteger(location.pageCount) &&
    location.pageCount >= location.pageNumber &&
    (location.viewMode === "single" || location.viewMode === "two-page") &&
    typeof location.zoom === "number" &&
    Number.isFinite(location.zoom) &&
    (location.zoomMode === "auto" ||
      location.zoomMode === "actual" ||
      location.zoomMode === "custom")
  );
}

function isEpubReaderLocation(
  location: unknown,
): location is EpubReaderLocation {
  if (!isObject(location)) {
    return false;
  }

  return (
    typeof location.cfi === "string" &&
    location.cfi.trim().length > 0 &&
    isNullableString(location.href) &&
    isNullableString(location.chapterTitle) &&
    isNullablePositiveInteger(location.displayedPage) &&
    isNullablePositiveInteger(location.displayedTotal) &&
    typeof location.fontSizePercent === "number" &&
    Number.isFinite(location.fontSizePercent) &&
    (location.viewMode === "single" || location.viewMode === "two-page")
  );
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isInteger(value) && value > 0)
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampEpubFontSize(fontSizePercent: number): number {
  return Math.min(
    maxEpubFontSize,
    Math.max(minEpubFontSize, Math.round(fontSizePercent)),
  );
}

function readerPanelLabel(panel: ReaderPanel): string {
  if (panel === "contents") {
    return "Table of contents";
  }

  if (panel === "bookmarks") {
    return "Bookmarks";
  }

  return "Highlights and notes";
}

function readerStatusTitle(status: ReaderStatus): string {
  if (status === "loading") {
    return "Opening book";
  }

  if (status === "not-found") {
    return "Book removed";
  }

  if (status === "missing-file") {
    return "Book unavailable";
  }

  return "Unable to open book";
}

function coverTitle(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase());

  return initials.join("") || title.slice(0, 2).toUpperCase() || "PC";
}

function coverTone(bookId: string): number {
  let hash = 0;

  for (const character of bookId) {
    hash = (hash + character.charCodeAt(0)) % 5;
  }

  return hash;
}

function formatFileSize(fileSize: number): string {
  if (fileSize < 1024) {
    return `${fileSize} B`;
  }

  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}

function formatProgress(book: LibraryBookSummary): string {
  if (!book.progress) {
    return "Not started";
  }

  const progressLabel = book.progress.label;
  const progressFraction = book.progress.progressFraction;

  if (typeof progressFraction === "number") {
    const progressPercent = `${Math.round(progressFraction * 100)}%`;
    return progressLabel
      ? `${progressLabel} - ${progressPercent}`
      : progressPercent;
  }

  return progressLabel ?? "In progress";
}

export default App;
