import type { DatabaseSync } from "node:sqlite";

type Migration = {
  id: number;
  name: string;
  sql: string;
};

type MigrationRow = {
  id: number;
};

const migrations: Migration[] = [
  {
    id: 1,
    name: "initial_storage_schema",
    sql: `
      CREATE TABLE books (
        id TEXT PRIMARY KEY,
        format TEXT NOT NULL CHECK (format IN ('pdf', 'epub')),
        title TEXT NOT NULL,
        file_hash TEXT NOT NULL UNIQUE,
        storage_path TEXT NOT NULL,
        cover_path TEXT,
        original_file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL CHECK (file_size >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT
      );

      CREATE TABLE reading_progress (
        book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
        format TEXT NOT NULL CHECK (format IN ('pdf', 'epub')),
        location_json TEXT NOT NULL,
        label TEXT,
        progress_fraction REAL CHECK (
          progress_fraction IS NULL OR
          (progress_fraction >= 0 AND progress_fraction <= 1)
        ),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE highlights (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        color TEXT NOT NULL,
        selected_text TEXT NOT NULL,
        location_json TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX highlights_book_id_idx ON highlights(book_id);

      CREATE TABLE bookmarks (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        location_json TEXT NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX bookmarks_book_id_idx ON bookmarks(book_id);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

export function runMigrations(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedMigrationIds = new Set(
    database
      .prepare("SELECT id FROM schema_migrations")
      .all()
      .map((row) => (row as MigrationRow).id),
  );

  for (const migration of migrations) {
    if (appliedMigrationIds.has(migration.id)) {
      continue;
    }

    database.exec("BEGIN");

    try {
      database.exec(migration.sql);
      database
        .prepare(
          `
            INSERT INTO schema_migrations (id, name, applied_at)
            VALUES (?, ?, ?)
          `,
        )
        .run(migration.id, migration.name, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}
