import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * Folds the built JS and CSS into `index.html`. A WebView host ships one file and
 * loads it off disk: no asset paths to get wrong, no requests to fail, and
 * nothing that can be half-copied into an app bundle.
 */
function inlineEverything(): Plugin {
  return {
    name: "player-single-file",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find(
        (file) => file.type === "asset" && file.fileName.endsWith(".html"),
      );
      if (!html || html.type !== "asset") return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        const base = file.fileName.split("/").pop() ?? file.fileName;
        if (file.type === "chunk") {
          // The replacement must be a function: minified React contains "$&",
          // and a string replacement would expand it into the matched script
          // tag, corrupting the bundle and putting the tag back.
          source = source.replace(
            new RegExp(`<script[^>]*src="[^"]*${base}"[^>]*></script>`, "u"),
            () => `<script type="module">${file.code}</script>`,
          );
          delete bundle[name];
        } else if (file.fileName.endsWith(".css")) {
          source = source.replace(
            new RegExp(`<link[^>]*href="[^"]*${base}"[^>]*>`, "u"),
            () => `<style>${String(file.source)}</style>`,
          );
          delete bundle[name];
        }
      }
      html.source = source;
    },
  };
}

/**
 * The demo page borrows the generator's shipped roll pictures so the player can
 * be opened and looked at on its own. A host hands its own pictures over and
 * never reaches for this folder, so they stay out of the shipped build.
 */
function demoPictures(): Plugin {
  return {
    name: "player-demo-pictures",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? "").split("?")[0] ?? "";
        if (!url.startsWith("/toolcraft-defaults/")) return next();
        const file = path.join(here, "..", "public", decodeURIComponent(url));
        if (!fs.existsSync(file)) return next();
        response.setHeader("content-type", "image/png");
        fs.createReadStream(file).pipe(response);
        return undefined;
      });
    },
  };
}

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    // One chunk and no preload plumbing: anything that resolves a chunk by name
    // at runtime would go looking for a file that inlining just removed.
    modulePreload: false,
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  // The player reaches into the generator for the scene, so `@` has to resolve
  // the same way it does there.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  plugins: [react(), demoPictures(), inlineEverything()],
});
