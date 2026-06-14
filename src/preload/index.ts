import { contextBridge, ipcRenderer } from "electron";
import type { PapercaseApi } from "../shared/papercase-api";

// Keep the renderer contract narrow; filesystem work will stay in the main process.
const api: PapercaseApi = Object.freeze({
  app: Object.freeze({
    getVersion: () => ipcRenderer.invoke("app:getVersion"),
  }),
  library: Object.freeze({
    listBooks: () => ipcRenderer.invoke("library:listBooks"),
    importBook: () => ipcRenderer.invoke("library:importBook"),
  }),
});

contextBridge.exposeInMainWorld("papercase", api);
