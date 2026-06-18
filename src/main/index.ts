import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  type MenuItemConstructorOptions,
  type OpenDialogOptions,
} from "electron";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  importBookFromFile,
  importErrorMessage,
  titleFromMetadataOrFileName,
} from "./library/import-service";
import {
  removeBookErrorMessage,
  removeBookFromLibrary,
} from "./library/remove-service";
import {
  BooksRepository,
  type BookRecord,
  type ReadingProgressRecord,
  type ReadingProgressSummary,
} from "./storage/books-repository";
import { initializeLocalStorage, type LocalStorage } from "./storage/database";
import { SettingsRepository } from "./storage/settings-repository";
import type {
  AppSettings,
  AppTheme,
  EpubDocumentLoadResult,
  EpubReaderLocation,
  LibraryBookSummary,
  LibraryImportResult,
  LibraryOpenResult,
  LibraryRemoveResult,
  PdfDocumentLoadResult,
  PdfReaderLocation,
  ReaderLocation,
  SaveReadingProgressInput,
  SaveReadingProgressResult,
  SettingsUpdateInput,
  SettingsUpdateResult,
} from "../shared/papercase-api";

app.setName("Papercase");

let mainWindow: BrowserWindow | null = null;
let storage: LocalStorage | null = null;

function rendererUrl(): string | null {
  return process.env.ELECTRON_RENDERER_URL ?? null;
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: "Papercase",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#101112" : "#f6f6f3",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const devServerUrl = rendererUrl();
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function createApplicationMenu(): void {
  const appMenu: MenuItemConstructorOptions[] =
    process.platform === "darwin"
      ? [
          {
            label: "Papercase",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : [];

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...appMenu,
      {
        label: "File",
        submenu: [
          process.platform === "darwin" ? { role: "close" } : { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Window",
        submenu: [{ role: "minimize" }, { role: "zoom" }],
      },
    ]),
  );
}

ipcMain.handle("app:getVersion", () => app.getVersion());

ipcMain.handle("library:listBooks", (): LibraryBookSummary[] => {
  return getBooksRepository().listWithProgress().map(bookRecordToSummary);
});

ipcMain.handle(
  "library:openBook",
  (_event, bookId: unknown): LibraryOpenResult => {
    if (typeof bookId !== "string" || bookId.trim().length === 0) {
      return {
        status: "failed",
        message: "The book could not be opened.",
      };
    }

    try {
      const book = getBooksRepository().findById(bookId);

      if (!book) {
        return {
          status: "not-found",
          message: "This book is no longer in your library.",
        };
      }

      if (!existsSync(book.storagePath)) {
        return {
          status: "missing-file",
          message: "The local copy for this book is missing.",
        };
      }

      return {
        status: "ready",
      };
    } catch {
      return {
        status: "failed",
        message: "The book could not be opened.",
      };
    }
  },
);

ipcMain.handle("library:importBook", async (): Promise<LibraryImportResult> => {
  const dialogOptions: OpenDialogOptions = {
    title: "Import book",
    properties: ["openFile"],
    filters: [
      {
        name: "EPUB and PDF",
        extensions: ["epub", "pdf"],
      },
    ],
  };
  const pickerResult = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (pickerResult.canceled || pickerResult.filePaths.length === 0) {
    return { status: "canceled" };
  }

  try {
    const importResult = await importBookFromFile(pickerResult.filePaths[0], {
      paths: getStorage().paths,
      repository: getBooksRepository(),
    });

    return {
      status: importResult.status,
      book: bookRecordToSummary(importResult.book),
    };
  } catch (error) {
    return {
      status: "failed",
      message: importErrorMessage(error),
    };
  }
});

ipcMain.handle(
  "library:removeBook",
  async (_event, bookId: unknown): Promise<LibraryRemoveResult> => {
    if (typeof bookId !== "string" || bookId.trim().length === 0) {
      return {
        status: "failed",
        message: removeBookErrorMessage(),
      };
    }

    try {
      const removeResult = await removeBookFromLibrary(bookId, {
        paths: getStorage().paths,
        repository: getBooksRepository(),
      });

      return {
        status: removeResult.status,
      };
    } catch {
      return {
        status: "failed",
        message: removeBookErrorMessage(),
      };
    }
  },
);

ipcMain.handle("settings:getSettings", (): AppSettings => {
  return getSettingsRepository().getSettings();
});

ipcMain.handle(
  "settings:updateSettings",
  (_event, input: unknown): SettingsUpdateResult => {
    const settingsUpdate = parseSettingsUpdateInput(input);

    if (!settingsUpdate) {
      return {
        status: "failed",
        message: "The setting could not be saved.",
      };
    }

    try {
      return {
        status: "updated",
        settings: getSettingsRepository().updateSettings(settingsUpdate),
      };
    } catch {
      return {
        status: "failed",
        message: "The setting could not be saved.",
      };
    }
  },
);

ipcMain.handle(
  "reader:loadPdf",
  async (_event, bookId: unknown): Promise<PdfDocumentLoadResult> => {
    if (typeof bookId !== "string" || bookId.trim().length === 0) {
      return {
        status: "failed",
        message: "The PDF could not be opened.",
      };
    }

    try {
      const repository = getBooksRepository();
      const book = repository.findById(bookId);

      if (!book) {
        return {
          status: "not-found",
          message: "This book is no longer in your library.",
        };
      }

      if (book.format !== "pdf") {
        return {
          status: "not-pdf",
          message: "This reader is only available for PDFs.",
        };
      }

      if (!existsSync(book.storagePath)) {
        return {
          status: "missing-file",
          message: "The local copy for this PDF is missing.",
        };
      }

      const fileData = await readFile(book.storagePath);
      const progress = repository.findProgressByBookId(book.id);

      return {
        status: "loaded",
        data: new Uint8Array(fileData),
        progress: progress ? progressRecordToReaderLocation(progress) : null,
      };
    } catch {
      return {
        status: "failed",
        message: "The PDF could not be opened.",
      };
    }
  },
);

ipcMain.handle(
  "reader:loadEpub",
  async (_event, bookId: unknown): Promise<EpubDocumentLoadResult> => {
    if (typeof bookId !== "string" || bookId.trim().length === 0) {
      return {
        status: "failed",
        message: "The EPUB could not be opened.",
      };
    }

    try {
      const repository = getBooksRepository();
      const book = repository.findById(bookId);

      if (!book) {
        return {
          status: "not-found",
          message: "This book is no longer in your library.",
        };
      }

      if (book.format !== "epub") {
        return {
          status: "not-epub",
          message: "This reader is only available for EPUBs.",
        };
      }

      if (!existsSync(book.storagePath)) {
        return {
          status: "missing-file",
          message: "The local copy for this EPUB is missing.",
        };
      }

      const fileData = await readFile(book.storagePath);
      const progress = repository.findProgressByBookId(book.id);

      return {
        status: "loaded",
        data: new Uint8Array(fileData),
        progress: progress ? progressRecordToReaderLocation(progress) : null,
      };
    } catch {
      return {
        status: "failed",
        message: "The EPUB could not be opened.",
      };
    }
  },
);

ipcMain.handle(
  "reader:saveProgress",
  (_event, input: unknown): SaveReadingProgressResult => {
    const progressInput = parseSaveReadingProgressInput(input);

    if (!progressInput) {
      return {
        status: "failed",
        message: "Reading progress could not be saved.",
      };
    }

    try {
      const repository = getBooksRepository();
      const book = repository.findById(progressInput.bookId);

      if (!book || book.format !== progressInput.format) {
        return {
          status: "failed",
          message: "Reading progress could not be saved.",
        };
      }

      const progress = repository.saveProgress({
        bookId: progressInput.bookId,
        format: progressInput.format,
        location: progressInput.location,
        label: progressInput.label,
        progressFraction: progressInput.progressFraction,
      });

      return {
        status: "saved",
        progress: {
          label: progress.label,
          progressFraction: progress.progressFraction,
          updatedAt: progress.updatedAt,
        },
      };
    } catch {
      return {
        status: "failed",
        message: "Reading progress could not be saved.",
      };
    }
  },
);

function getStorage(): LocalStorage {
  if (!storage) {
    throw new Error("Papercase storage has not been initialized.");
  }

  return storage;
}

function getBooksRepository(): BooksRepository {
  return new BooksRepository(getStorage().database);
}

function getSettingsRepository(): SettingsRepository {
  return new SettingsRepository(getStorage().database);
}

function bookRecordToSummary(
  record: BookRecord & { progress?: ReadingProgressSummary | null },
): LibraryBookSummary {
  return {
    id: record.id,
    format: record.format,
    title: titleFromMetadataOrFileName(record.title, record.originalFileName),
    originalFileName: record.originalFileName,
    fileSize: record.fileSize,
    progress: record.progress ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
  };
}

function progressRecordToReaderLocation(
  progress: ReadingProgressRecord,
): ReaderLocation {
  return {
    bookId: progress.bookId,
    format: progress.format,
    location: progress.location,
    label: progress.label ?? undefined,
  };
}

function parseSettingsUpdateInput(input: unknown): SettingsUpdateInput | null {
  if (!isObject(input)) {
    return null;
  }

  if (input.theme !== undefined && !isAppTheme(input.theme)) {
    return null;
  }

  return {
    theme: input.theme,
  };
}

function parseSaveReadingProgressInput(
  input: unknown,
): SaveReadingProgressInput | null {
  if (!isObject(input)) {
    return null;
  }

  if (
    typeof input.bookId !== "string" ||
    input.bookId.trim().length === 0 ||
    (input.format !== "pdf" && input.format !== "epub") ||
    typeof input.label !== "string"
  ) {
    return null;
  }

  if (
    input.progressFraction !== null &&
    (typeof input.progressFraction !== "number" ||
      !Number.isFinite(input.progressFraction) ||
      input.progressFraction < 0 ||
      input.progressFraction > 1)
  ) {
    return null;
  }

  if (input.format === "pdf") {
    const location = parsePdfReaderLocation(input.location);

    return location
      ? {
          bookId: input.bookId,
          format: "pdf",
          location,
          label: input.label,
          progressFraction: input.progressFraction,
        }
      : null;
  }

  const location = parseEpubReaderLocation(input.location);

  return location
    ? {
        bookId: input.bookId,
        format: "epub",
        location,
        label: input.label,
        progressFraction: input.progressFraction,
      }
    : null;
}

function parseEpubReaderLocation(input: unknown): EpubReaderLocation | null {
  if (!isObject(input)) {
    return null;
  }

  const cfi = input.cfi;
  const href = input.href;
  const chapterTitle = input.chapterTitle;
  const displayedPage = input.displayedPage;
  const displayedTotal = input.displayedTotal;
  const fontSizePercent = input.fontSizePercent;
  const viewMode = input.viewMode;

  if (
    typeof cfi !== "string" ||
    cfi.trim().length === 0 ||
    !isNullableString(href) ||
    !isNullableString(chapterTitle) ||
    !isNullableInteger(displayedPage) ||
    !isNullableInteger(displayedTotal) ||
    typeof fontSizePercent !== "number" ||
    !Number.isInteger(fontSizePercent) ||
    (viewMode !== "single" && viewMode !== "two-page")
  ) {
    return null;
  }

  if (
    (displayedPage !== null && displayedPage < 1) ||
    (displayedTotal !== null && displayedTotal < 1) ||
    (displayedPage !== null &&
      displayedTotal !== null &&
      displayedPage > displayedTotal) ||
    fontSizePercent < 80 ||
    fontSizePercent > 160
  ) {
    return null;
  }

  return {
    cfi,
    href,
    chapterTitle,
    displayedPage,
    displayedTotal,
    fontSizePercent,
    viewMode,
  };
}

function parsePdfReaderLocation(input: unknown): PdfReaderLocation | null {
  if (!isObject(input)) {
    return null;
  }

  const pageNumber = input.pageNumber;
  const pageCount = input.pageCount;
  const viewMode = input.viewMode;
  const zoom = input.zoom;
  const zoomMode = input.zoomMode;

  if (
    typeof pageNumber !== "number" ||
    !Number.isInteger(pageNumber) ||
    typeof pageCount !== "number" ||
    !Number.isInteger(pageCount) ||
    (viewMode !== "single" && viewMode !== "two-page") ||
    typeof zoom !== "number" ||
    !Number.isFinite(zoom) ||
    !isPdfZoomMode(zoomMode)
  ) {
    return null;
  }

  if (
    pageNumber < 1 ||
    pageCount < 1 ||
    pageNumber > pageCount ||
    zoom < 0.5 ||
    zoom > 2
  ) {
    return null;
  }

  return {
    pageNumber,
    pageCount,
    viewMode,
    zoom,
    zoomMode,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableInteger(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isInteger(value))
  );
}

function isAppTheme(value: unknown): value is AppTheme {
  return value === "system" || value === "light" || value === "dark";
}

function isPdfZoomMode(value: unknown): value is PdfReaderLocation["zoomMode"] {
  return value === "auto" || value === "actual" || value === "custom";
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.ajmdz.papercase");
  storage = initializeLocalStorage(app.getPath("userData"));

  createApplicationMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  storage?.database.close();
  storage = null;
});
