import { contextBridge, ipcRenderer } from "electron";
import type {
  CreateBookmarkInput,
  CreateHighlightInput,
  DeleteBookmarkInput,
  DeleteHighlightInput,
  PapercaseApi,
  SaveReadingProgressInput,
  SettingsUpdateInput,
  UpdateHighlightInput,
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
  reader: Object.freeze({
    loadPdf: (bookId: string) => ipcRenderer.invoke("reader:loadPdf", bookId),
    loadEpub: (bookId: string) => ipcRenderer.invoke("reader:loadEpub", bookId),
    saveProgress: (input: SaveReadingProgressInput) =>
      ipcRenderer.invoke("reader:saveProgress", input),
  }),
  bookmarks: Object.freeze({
    listBookmarks: (bookId: string) =>
      ipcRenderer.invoke("bookmarks:listBookmarks", bookId),
    createBookmark: (input: CreateBookmarkInput) =>
      ipcRenderer.invoke("bookmarks:createBookmark", input),
    deleteBookmark: (input: DeleteBookmarkInput) =>
      ipcRenderer.invoke("bookmarks:deleteBookmark", input),
  }),
  highlights: Object.freeze({
    listHighlights: (bookId: string) =>
      ipcRenderer.invoke("highlights:listHighlights", bookId),
    createHighlight: (input: CreateHighlightInput) =>
      ipcRenderer.invoke("highlights:createHighlight", input),
    updateHighlight: (input: UpdateHighlightInput) =>
      ipcRenderer.invoke("highlights:updateHighlight", input),
    deleteHighlight: (input: DeleteHighlightInput) =>
      ipcRenderer.invoke("highlights:deleteHighlight", input),
  }),
});

contextBridge.exposeInMainWorld("papercase", api);
