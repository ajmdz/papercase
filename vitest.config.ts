import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@renderer": resolve(rootDir, "src/renderer/src"),
      "@shared": resolve(rootDir, "src/shared"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/renderer/src/test/setup.ts"],
  },
});
