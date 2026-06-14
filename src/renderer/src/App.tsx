import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import type {
  LibraryBookSummary,
  LibraryImportResult,
  LibraryRemoveResult,
} from "../../shared/papercase-api";

type Notice = {
  tone: "success" | "info" | "error";
  message: string;
} | null;

function App(): ReactElement {
  const [version, setVersion] = useState<string | null>(null);
  const [books, setBooks] = useState<LibraryBookSummary[]>([]);
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

    return () => {
      isMounted = false;
    };
  }, []);

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

        {notice ? (
          <p className={`notice is-${notice.tone}`} role="status">
            {notice.message}
          </p>
        ) : null}

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

function BookCard({
  book,
  isOptionsOpen,
  onRequestRemove,
  onToggleOptions,
}: {
  book: LibraryBookSummary;
  isOptionsOpen: boolean;
  onRequestRemove: (bookId: string) => void;
  onToggleOptions: (bookId: string) => void;
}): ReactElement {
  return (
    <article className="book-card">
      <div className="book-card-top">
        <div
          className={`book-cover tone-${coverTone(book.id)}`}
          aria-hidden="true"
        >
          <span className="book-cover-title">{coverTitle(book.title)}</span>
          <span className="book-cover-format">{book.format.toUpperCase()}</span>
        </div>
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
      </div>
      <div className="book-details">
        <h2>{book.title}</h2>
        <p className="book-byline">
          {book.format.toUpperCase()} / {formatFileSize(book.fileSize)}
        </p>
        <p className="book-progress">{formatProgress(book)}</p>
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
