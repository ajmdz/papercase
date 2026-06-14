import { rm } from "node:fs/promises";
import type { BookRecord, BooksRepository } from "../storage/books-repository";
import {
  resolveBookStoragePaths,
  type AppStoragePaths,
} from "../storage/paths";

export type RemoveBookDependencies = {
  paths: AppStoragePaths;
  repository: BooksRepository;
  removeDirectory?: (directoryPath: string) => Promise<void>;
};

export type RemoveBookFromLibraryResult =
  | {
      status: "removed";
      book: BookRecord;
    }
  | {
      status: "not-found";
    };

export async function removeBookFromLibrary(
  bookId: string,
  dependencies: RemoveBookDependencies,
): Promise<RemoveBookFromLibraryResult> {
  const book = dependencies.repository.findById(bookId);

  if (!book) {
    return { status: "not-found" };
  }

  const bookStorageDirectory = resolveBookStoragePaths(
    dependencies.paths,
    book.id,
    book.format,
  ).directory;
  const removeDirectory = dependencies.removeDirectory ?? removeLocalDirectory;

  await removeDirectory(bookStorageDirectory);

  if (!dependencies.repository.delete(book.id)) {
    return { status: "not-found" };
  }

  return {
    status: "removed",
    book,
  };
}

export function removeBookErrorMessage(): string {
  return "The book could not be removed. Its local data was left in place.";
}

async function removeLocalDirectory(directoryPath: string): Promise<void> {
  await rm(directoryPath, { recursive: true, force: true });
}
