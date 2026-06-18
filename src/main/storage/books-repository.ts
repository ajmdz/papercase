import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { BookFormat } from "./paths";

export type BookRecord = {
  id: string;
  format: BookFormat;
  title: string;
  fileHash: string;
  storagePath: string;
  coverPath: string | null;
  originalFileName: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
};

export type ReadingProgressSummary = {
  label: string | null;
  progressFraction: number | null;
  updatedAt: string;
};

export type ReadingProgressRecord = ReadingProgressSummary & {
  bookId: string;
  format: BookFormat;
  location: unknown;
};

export type BookmarkRecord = {
  id: string;
  bookId: string;
  location: unknown;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookRecordWithProgress = BookRecord & {
  progress: ReadingProgressSummary | null;
};

export type CreateBookRecordInput = {
  id?: string;
  format: BookFormat;
  title: string;
  fileHash: string;
  storagePath: string;
  coverPath?: string | null;
  originalFileName: string;
  fileSize: number;
};

export type SaveReadingProgressRecordInput = {
  bookId: string;
  format: BookFormat;
  location: unknown;
  label: string | null;
  progressFraction: number | null;
};

export type CreateBookmarkRecordInput = {
  id?: string;
  bookId: string;
  location: unknown;
  label: string | null;
};

type BookRow = {
  id: string;
  format: BookFormat;
  title: string;
  file_hash: string;
  storage_path: string;
  cover_path: string | null;
  original_file_name: string;
  file_size: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
};

type BookWithProgressRow = BookRow & {
  progress_label: string | null;
  progress_fraction: number | null;
  progress_updated_at: string | null;
};

type ReadingProgressRow = {
  book_id: string;
  format: BookFormat;
  location_json: string;
  label: string | null;
  progress_fraction: number | null;
  updated_at: string;
};

type BookmarkRow = {
  id: string;
  book_id: string;
  location_json: string;
  label: string | null;
  created_at: string;
  updated_at: string;
};

export class BooksRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(input: CreateBookRecordInput): BookRecord {
    const now = new Date().toISOString();
    const record: BookRecord = {
      id: input.id ?? randomUUID(),
      format: input.format,
      title: input.title,
      fileHash: input.fileHash,
      storagePath: input.storagePath,
      coverPath: input.coverPath ?? null,
      originalFileName: input.originalFileName,
      fileSize: input.fileSize,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
    };

    this.database
      .prepare(
        `
          INSERT INTO books (
            id,
            format,
            title,
            file_hash,
            storage_path,
            cover_path,
            original_file_name,
            file_size,
            created_at,
            updated_at,
            last_opened_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        record.id,
        record.format,
        record.title,
        record.fileHash,
        record.storagePath,
        record.coverPath,
        record.originalFileName,
        record.fileSize,
        record.createdAt,
        record.updatedAt,
        record.lastOpenedAt,
      );

    return record;
  }

  list(): BookRecord[] {
    return this.database
      .prepare(
        `
          SELECT *
          FROM books
          ORDER BY created_at DESC, title ASC
        `,
      )
      .all()
      .map((row) => rowToBookRecord(row as BookRow));
  }

  listWithProgress(): BookRecordWithProgress[] {
    return this.database
      .prepare(
        `
          SELECT
            books.*,
            reading_progress.label AS progress_label,
            reading_progress.progress_fraction AS progress_fraction,
            reading_progress.updated_at AS progress_updated_at
          FROM books
          LEFT JOIN reading_progress ON reading_progress.book_id = books.id
          ORDER BY COALESCE(books.last_opened_at, books.created_at) DESC, books.title ASC
        `,
      )
      .all()
      .map((row) => rowToBookRecordWithProgress(row as BookWithProgressRow));
  }

  findById(bookId: string): BookRecord | null {
    const row = this.database
      .prepare("SELECT * FROM books WHERE id = ?")
      .get(bookId) as BookRow | undefined;

    return row ? rowToBookRecord(row) : null;
  }

  findByFileHash(fileHash: string): BookRecord | null {
    const row = this.database
      .prepare("SELECT * FROM books WHERE file_hash = ?")
      .get(fileHash) as BookRow | undefined;

    return row ? rowToBookRecord(row) : null;
  }

  delete(bookId: string): boolean {
    const result = this.database
      .prepare("DELETE FROM books WHERE id = ?")
      .run(bookId);

    return Number(result.changes) > 0;
  }

  findProgressByBookId(bookId: string): ReadingProgressRecord | null {
    const row = this.database
      .prepare("SELECT * FROM reading_progress WHERE book_id = ?")
      .get(bookId) as ReadingProgressRow | undefined;

    return row ? rowToReadingProgressRecord(row) : null;
  }

  saveProgress(input: SaveReadingProgressRecordInput): ReadingProgressRecord {
    const now = new Date().toISOString();
    const locationJson = JSON.stringify(input.location);

    this.database
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
          ON CONFLICT(book_id) DO UPDATE SET
            format = excluded.format,
            location_json = excluded.location_json,
            label = excluded.label,
            progress_fraction = excluded.progress_fraction,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        input.bookId,
        input.format,
        locationJson,
        input.label,
        input.progressFraction,
        now,
      );

    this.database
      .prepare(
        `
          UPDATE books
          SET last_opened_at = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(now, now, input.bookId);

    return {
      bookId: input.bookId,
      format: input.format,
      location: input.location,
      label: input.label,
      progressFraction: input.progressFraction,
      updatedAt: now,
    };
  }

  listBookmarksByBookId(bookId: string): BookmarkRecord[] {
    return this.database
      .prepare(
        `
          SELECT *
          FROM bookmarks
          WHERE book_id = ?
          ORDER BY created_at DESC, id ASC
        `,
      )
      .all(bookId)
      .map((row) => rowToBookmarkRecord(row as BookmarkRow));
  }

  createBookmark(input: CreateBookmarkRecordInput): BookmarkRecord {
    const now = new Date().toISOString();
    const record: BookmarkRecord = {
      id: input.id ?? randomUUID(),
      bookId: input.bookId,
      location: input.location,
      label:
        input.label && input.label.trim().length > 0
          ? input.label.trim()
          : null,
      createdAt: now,
      updatedAt: now,
    };

    this.database
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
        record.id,
        record.bookId,
        JSON.stringify(record.location),
        record.label,
        record.createdAt,
        record.updatedAt,
      );

    return record;
  }

  deleteBookmark(bookId: string, bookmarkId: string): boolean {
    const result = this.database
      .prepare("DELETE FROM bookmarks WHERE book_id = ? AND id = ?")
      .run(bookId, bookmarkId);

    return Number(result.changes) > 0;
  }
}

function rowToBookRecord(row: BookRow): BookRecord {
  return {
    id: row.id,
    format: row.format,
    title: row.title,
    fileHash: row.file_hash,
    storagePath: row.storage_path,
    coverPath: row.cover_path,
    originalFileName: row.original_file_name,
    fileSize: row.file_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
  };
}

function rowToBookRecordWithProgress(
  row: BookWithProgressRow,
): BookRecordWithProgress {
  return {
    ...rowToBookRecord(row),
    progress:
      row.progress_updated_at === null
        ? null
        : {
            label: row.progress_label,
            progressFraction: row.progress_fraction,
            updatedAt: row.progress_updated_at,
          },
  };
}

function rowToReadingProgressRecord(
  row: ReadingProgressRow,
): ReadingProgressRecord {
  return {
    bookId: row.book_id,
    format: row.format,
    location: JSON.parse(row.location_json) as unknown,
    label: row.label,
    progressFraction: row.progress_fraction,
    updatedAt: row.updated_at,
  };
}

function rowToBookmarkRecord(row: BookmarkRow): BookmarkRecord {
  return {
    id: row.id,
    bookId: row.book_id,
    location: JSON.parse(row.location_json) as unknown,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
