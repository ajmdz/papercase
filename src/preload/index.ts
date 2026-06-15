import { contextBridge, ipcRenderer } from "electron";
import type {
  PapercaseApi,
  SettingsUpdateInput,
} from "../shared/papercase-api";

// Keep the renderer contract narrow; filesystem work will stay in the main process.
const api: PapercaseApi = Object.freeze({
  app: Object.freeze({
    getVersion: () => ipcRenderer.invoke("app:getVersion"),
  }),
  library: Object.freeze({
    listBooks: () => ipcRenderer.invoke("library:listBooks"),
    openBook: (bookId: string) =>
      ipcRenderer.invoke("library:openBook", bookId),
    importBook: () => ipcRenderer.invoke("library:importBook"),
    removeBook: (bookId: string) =>
      ipcRenderer.invoke("library:removeBook", bookId),
  }),
  settings: Object.freeze({
    getSettings: () => ipcRenderer.invoke("settings:getSettings"),
    updateSettings: (input: SettingsUpdateInput) =>
      ipcRenderer.invoke("settings:updateSettings", input),
  }),
});

contextBridge.exposeInMainWorld("papercase", api);
