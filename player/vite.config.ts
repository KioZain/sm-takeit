import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The player is its own tiny app, not a second entry of the generator: the
 * generator's `index.html`, `vite.config.ts` and router are signed Toolcraft
 * files and cannot take another entry. It builds from this folder and reaches
 * into `src/app/iso` for the scene, so the same `@` alias has to resolve.
 */
export default defineConfig({
  base: "./",
  // The demo page borrows the generator's shipped roll pictures; a real host
  // hands its own over and never reaches for this folder.
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  plugins: [react()],
});
