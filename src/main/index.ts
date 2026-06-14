import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  type MenuItemConstructorOptions,
} from "electron";
import { join } from "node:path";
import { initializeLocalStorage, type LocalStorage } from "./storage/database";

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
