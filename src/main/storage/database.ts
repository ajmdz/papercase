import { DatabaseSync } from "node:sqlite";
import {
  ensureAppStorageDirectories,
  resolveAppStoragePaths,
  type AppStoragePaths,
} from "./paths";
import { runMigrations } from "./migrations";

export type LocalStorage = {
  paths: AppStoragePaths;
  database: DatabaseSync;
};

export function initializeLocalStorage(userDataDir: string): LocalStorage {
  const paths = resolveAppStoragePaths(userDataDir);

  ensureAppStorageDirectories(paths);

  const database = openDatabase(paths.databasePath);
  runMigrations(database);

  return { paths, database };
}

export function openDatabase(databasePath: string): DatabaseSync {
  const database = new DatabaseSync(databasePath);

  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");

  return database;
}
