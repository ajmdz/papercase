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

  findById(bookId: string): BookRecord | null {
    const row = this.database
      .prepare("SELECT * FROM books WHERE id = ?")
      .get(bookId) as BookRow | undefined;

    return row ? rowToBookRecord(row) : null;
  }

  delete(bookId: string): boolean {
    const result = this.database
      .prepare("DELETE FROM books WHERE id = ?")
      .run(bookId);

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
