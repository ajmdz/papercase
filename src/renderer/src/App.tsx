import type { ReactElement } from "react";
import { useEffect, useState } from "react";

function App(): ReactElement {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    window.papercase?.app
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

    return () => {
      isMounted = false;
    };
  }, []);

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
          <span className="book-count">0 books</span>
        </header>

        <section className="empty-state" aria-labelledby="empty-library-title">
          <div className="empty-cover" aria-hidden="true">
            <span>PC</span>
          </div>
          <div className="empty-copy">
            <h2 id="empty-library-title">No books yet</h2>
            <p>Imported EPUBs and PDFs will appear here.</p>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
