import { mkdirSync } from "node:fs";
import { join } from "node:path";

export type BookFormat = "pdf" | "epub";

export type AppStoragePaths = {
  userDataDir: string;
  databasePath: string;
  booksDir: string;
};

export type BookStoragePaths = {
  directory: string;
  sourceFile: string;
  coverFile: string;
};

export function resolveAppStoragePaths(userDataDir: string): AppStoragePaths {
  return {
    userDataDir,
    databasePath: join(userDataDir, "papercase.sqlite"),
    booksDir: join(userDataDir, "books"),
  };
}

export function ensureAppStorageDirectories(paths: AppStoragePaths): void {
  mkdirSync(paths.booksDir, { recursive: true });
}

export function resolveBookStoragePaths(
  paths: AppStoragePaths,
  bookId: string,
  format: BookFormat,
): BookStoragePaths {
  assertSafeStorageSegment(bookId);

  const directory = join(paths.booksDir, bookId);

  return {
    directory,
    sourceFile: join(directory, `source.${format}`),
    coverFile: join(directory, "cover.png"),
  };
}

export function ensureBookStorageDirectory(paths: BookStoragePaths): void {
  mkdirSync(paths.directory, { recursive: true });
}

function assertSafeStorageSegment(segment: string): void {
  if (
    segment.length === 0 ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\")
  ) {
    throw new Error(`Unsafe storage path segment: ${segment}`);
  }
}
