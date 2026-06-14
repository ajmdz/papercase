/// <reference types="vite/client" />

import type { PapercaseApi } from "../../shared/papercase-api";

declare global {
  interface Window {
    papercase?: PapercaseApi;
  }
}

export {};
