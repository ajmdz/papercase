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
import { join } from "node:path";
import {
  importBookFromFile,
  importErrorMessage,
  titleFromMetadataOrFileName,
} from "./library/import-service";
import { BooksRepository, type BookRecord } from "./storage/books-repository";
import { initializeLocalStorage, type LocalStorage } from "./storage/database";
import type {
  LibraryBookSummary,
  LibraryImportResult,
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
  return getBooksRepository().list().map(bookRecordToSummary);
});

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

function getStorage(): LocalStorage {
  if (!storage) {
    throw new Error("Papercase storage has not been initialized.");
  }

  return storage;
}

function getBooksRepository(): BooksRepository {
  return new BooksRepository(getStorage().database);
}

function bookRecordToSummary(record: BookRecord): LibraryBookSummary {
  return {
    id: record.id,
    format: record.format,
    title: titleFromMetadataOrFileName(record.title, record.originalFileName),
    originalFileName: record.originalFileName,
    fileSize: record.fileSize,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
  };
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
