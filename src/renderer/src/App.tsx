import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import type {
  LibraryBookSummary,
  LibraryImportResult,
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

  async function handleImportBook(): Promise<void> {
    const api = window.papercase;

    if (!api || isImporting) {
      return;
    }

    setIsImporting(true);
    setNotice(null);

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

  const bookCount = books.length;
  const bookCountLabel = `${bookCount} ${bookCount === 1 ? "book" : "books"}`;

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
              <BookCard book={book} key={book.id} />
            ))}
          </section>
        )}
      </section>
    </main>
  );
}

function BookCard({ book }: { book: LibraryBookSummary }): ReactElement {
  return (
    <article className="book-card">
      <div
        className={`book-cover tone-${coverTone(book.id)}`}
        aria-hidden="true"
      >
        <span className="book-cover-title">{coverTitle(book.title)}</span>
        <span className="book-cover-format">{book.format.toUpperCase()}</span>
      </div>
      <div className="book-details">
        <h2>{book.title}</h2>
        <p>{book.originalFileName}</p>
        <dl className="book-meta">
          <div>
            <dt>Format</dt>
            <dd>{book.format.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{formatFileSize(book.fileSize)}</dd>
          </div>
        </dl>
      </div>
    </article>
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

export default App;
