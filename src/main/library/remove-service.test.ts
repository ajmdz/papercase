// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BooksRepository, type BookRecord } from "../storage/books-repository";
import { initializeLocalStorage, type LocalStorage } from "../storage/database";
import { resolveBookStoragePaths } from "../storage/paths";
import { removeBookFromLibrary } from "./remove-service";

type CountRow = {
  count: number;
};

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("removeBookFromLibrary", () => {
  it("deletes the copied file directory and associated reading data", async () => {
    const storage = initializeLocalStorage(makeTempDir());
    const repository = new BooksRepository(storage.database);

    try {
      const book = createStoredBook(storage, repository);
      addAssociatedReadingData(storage, book);

      const result = await removeBookFromLibrary(book.id, {
        paths: storage.paths,
        repository,
      });

      expect(result).toEqual({
        status: "removed",
        book,
      });
      expect(existsSync(join(storage.paths.booksDir, book.id))).toBe(false);
      expect(repository.findById(book.id)).toBeNull();
      expect(countRows(storage, "reading_progress")).toBe(0);
      expect(countRows(storage, "highlights")).toBe(0);
      expect(countRows(storage, "bookmarks")).toBe(0);
    } finally {
      storage.database.close();
    }
  });

  it("leaves the library unchanged when the book is missing", async () => {
    const storage = initializeLocalStorage(makeTempDir());
    const repository = new BooksRepository(storage.database);

    try {
      await expect(
        removeBookFromLibrary("missing-book", {
          paths: storage.paths,
          repository,
        }),
      ).resolves.toEqual({ status: "not-found" });
      expect(repository.list()).toEqual([]);
    } finally {
      storage.database.close();
    }
  });

  it("keeps records visible when local data cannot be removed cleanly", async () => {
    const storage = initializeLocalStorage(makeTempDir());
    const repository = new BooksRepository(storage.database);

    try {
      const book = createStoredBook(storage, repository);
      addAssociatedReadingData(storage, book);

      await expect(
        removeBookFromLibrary(book.id, {
          paths: storage.paths,
          repository,
          removeDirectory: async () => {
            throw new Error("Directory is locked.");
          },
        }),
      ).rejects.toThrow("Directory is locked.");

      expect(existsSync(join(storage.paths.booksDir, book.id))).toBe(true);
      expect(repository.findById(book.id)).toEqual(book);
      expect(countRows(storage, "reading_progress")).toBe(1);
      expect(countRows(storage, "highlights")).toBe(1);
      expect(countRows(storage, "bookmarks")).toBe(1);
    } finally {
      storage.database.close();
    }
  });
});

function createStoredBook(
  storage: LocalStorage,
  repository: BooksRepository,
): BookRecord {
  const bookPaths = resolveBookStoragePaths(storage.paths, "book-1", "pdf");

  mkdirSync(bookPaths.directory, { recursive: true });
  writeFileSync(bookPaths.sourceFile, "%PDF-1.7\nlocal copy\n");

  return repository.create({
    id: "book-1",
    format: "pdf",
    title: "Quiet Systems",
    fileHash: "sha256:remove-me",
    storagePath: bookPaths.sourceFile,
    coverPath: null,
    originalFileName: "quiet-systems.pdf",
    fileSize: 2048,
  });
}

function addAssociatedReadingData(
  storage: LocalStorage,
  book: BookRecord,
): void {
  const now = new Date().toISOString();

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
      book.id,
      book.format,
      JSON.stringify({ page: 12 }),
      "Page 12",
      0.25,
      now,
    );

  storage.database
    .prepare(
      `
        INSERT INTO highlights (
          id,
          book_id,
          color,
          selected_text,
          location_json,
          note,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "highlight-1",
      book.id,
      "yellow",
      "a selected passage",
      JSON.stringify({ page: 12 }),
      "Worth returning to.",
      now,
      now,
    );

  storage.database
    .prepare(
      `
        INSERT INTO bookmarks (
          id,
          book_id,
          location_json,
          label,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "bookmark-1",
      book.id,
      JSON.stringify({ page: 18 }),
      "Page 18",
      now,
      now,
    );
}

function countRows(storage: LocalStorage, tableName: string): number {
  const row = storage.database
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName}`)
    .get() as CountRow;

  return row.count;
}

function makeTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "papercase-remove-"));
  tempDirs.push(tempDir);
  return tempDir;
}
