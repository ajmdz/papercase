// @vitest-environment node

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BooksRepository } from "./books-repository";
import { initializeLocalStorage } from "./database";
import { runMigrations } from "./migrations";
import { resolveBookStoragePaths } from "./paths";

type CountRow = {
  count: number;
};

type MigrationCountRow = {
  migration_count: number;
};

type TableRow = {
  name: string;
};

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("local storage", () => {
  it("creates the database and book storage directory inside app user data", () => {
    const userDataDir = makeUserDataDir();
    const storage = initializeLocalStorage(userDataDir);

    try {
      expect(storage.paths).toEqual({
        userDataDir,
        databasePath: join(userDataDir, "papercase.sqlite"),
        booksDir: join(userDataDir, "books"),
      });
      expect(existsSync(storage.paths.databasePath)).toBe(true);
      expect(existsSync(storage.paths.booksDir)).toBe(true);

      const tableNames = storage.database
        .prepare(
          `
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            ORDER BY name
          `,
        )
        .all()
        .map((row) => (row as TableRow).name);

      expect(tableNames).toEqual(
        expect.arrayContaining([
          "bookmarks",
          "books",
          "highlights",
          "reading_progress",
          "schema_migrations",
          "settings",
        ]),
      );
    } finally {
      storage.database.close();
    }
  });

  it("runs migrations idempotently", () => {
    const storage = initializeLocalStorage(makeUserDataDir());

    try {
      runMigrations(storage.database);
      runMigrations(storage.database);

      const row = storage.database
        .prepare(
          `
            SELECT COUNT(*) AS migration_count
            FROM schema_migrations
          `,
        )
        .get() as MigrationCountRow;

      expect(row.migration_count).toBe(1);
    } finally {
      storage.database.close();
    }
  });

  it("resolves per-book file and cover paths without creating renderer-visible filesystem behavior", () => {
    const storage = initializeLocalStorage(makeUserDataDir());

    try {
      const bookPaths = resolveBookStoragePaths(storage.paths, "book-1", "pdf");

      expect(bookPaths).toEqual({
        directory: join(storage.paths.booksDir, "book-1"),
        sourceFile: join(storage.paths.booksDir, "book-1", "source.pdf"),
        coverFile: join(storage.paths.booksDir, "book-1", "cover.png"),
      });
      expect(() =>
        resolveBookStoragePaths(storage.paths, "../book-1", "pdf"),
      ).toThrow("Unsafe storage path segment");
    } finally {
      storage.database.close();
    }
  });
});

describe("BooksRepository", () => {
  it("creates, reads, lists, and deletes book records", () => {
    const storage = initializeLocalStorage(makeUserDataDir());
    const repository = new BooksRepository(storage.database);

    try {
      const created = repository.create({
        id: "book-1",
        format: "epub",
        title: "Designing With Care",
        fileHash: "sha256:abc123",
        storagePath: join(storage.paths.booksDir, "book-1", "source.epub"),
        coverPath: null,
        originalFileName: "designing-with-care.epub",
        fileSize: 1024,
      });

      expect(created).toMatchObject({
        id: "book-1",
        format: "epub",
        title: "Designing With Care",
        fileHash: "sha256:abc123",
        storagePath: join(storage.paths.booksDir, "book-1", "source.epub"),
        coverPath: null,
        originalFileName: "designing-with-care.epub",
        fileSize: 1024,
        lastOpenedAt: null,
      });
      expect(repository.findById("book-1")).toEqual(created);
      expect(repository.findByFileHash("sha256:abc123")).toEqual(created);
      expect(repository.findByFileHash("sha256:missing")).toBeNull();
      expect(repository.list()).toEqual([created]);

      expect(repository.delete("book-1")).toBe(true);
      expect(repository.findById("book-1")).toBeNull();
      expect(repository.list()).toEqual([]);
      expect(repository.delete("book-1")).toBe(false);
    } finally {
      storage.database.close();
    }
  });

  it("cascades associated reading records when a book is deleted", () => {
    const storage = initializeLocalStorage(makeUserDataDir());
    const repository = new BooksRepository(storage.database);

    try {
      repository.create({
        id: "book-1",
        format: "pdf",
        title: "Quiet Systems",
        fileHash: "sha256:def456",
        storagePath: join(storage.paths.booksDir, "book-1", "source.pdf"),
        originalFileName: "quiet-systems.pdf",
        fileSize: 2048,
      });

      storage.database
        .prepare(
          `
            INSERT INTO reading_progress (
              book_id,
              format,
              location_json,
              label,
              progress_fraction,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          "book-1",
          "pdf",
          JSON.stringify({ page: 12 }),
          "Page 12",
          0.25,
          new Date().toISOString(),
        );

      expect(repository.delete("book-1")).toBe(true);

      const row = storage.database
        .prepare(
          `
            SELECT COUNT(*) AS count
            FROM reading_progress
          `,
        )
        .get() as CountRow;

      expect(row.count).toBe(0);
    } finally {
      storage.database.close();
    }
  });
});

function makeUserDataDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "papercase-storage-"));
  tempDirs.push(tempDir);
  return tempDir;
}
