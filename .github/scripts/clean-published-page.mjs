#!/usr/bin/env node
// Cleans the built page before it is published. index.html is framework-owned,
// so this is where the shared link is shaped: social preview metadata and the
// framework project name are removed, the page gets its public title, and the
// favicon is linked at the published base path.
import { readFileSync, writeFileSync } from "node:fs";

const [pagePath, basePath = "/", pageTitle = ""] = process.argv.slice(2);

if (!pagePath) {
  throw new Error("Usage: clean-published-page.mjs <dist/index.html> [/base-path/] [title]");
}

const escapeHtml = (text) =>
  text.replace(/[&<>"]/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

const strippedMeta =
  /[ \t]*<meta[^>]*\b(?:property|name)\s*=\s*["'](?:og:[^"']*|twitter:[^"']*|description|keywords|author|toolcraft-app-title)["'][^>]*>\r?\n?/gi;

const normalizedBase = basePath.replace(/\/?$/u, "/");
const favicon = `<link rel="icon" href="${normalizedBase}favicon.ico" />`;

// The runtime fetches saved default media from the site root ("/toolcraft-defaults/..."),
// which misses a project page served from a subfolder. The published page teaches fetch
// about the base path before the app module runs; at the root the shim is unnecessary.
const defaultMediaBaseShim =
  normalizedBase === "/"
    ? ""
    : `<script>(function(){var b=${JSON.stringify(normalizedBase)},p="/toolcraft-defaults/",f=window.fetch.bind(window);` +
      `window.fetch=function(i,o){return typeof i==="string"&&i.indexOf(p)===0?f(b+i.slice(1),o):f(i,o);};})();</script>`;
const cleaned = readFileSync(pagePath, "utf8")
  .replace(strippedMeta, "")
  .replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(pageTitle)}</title>\n    ${favicon}\n    ${defaultMediaBaseShim}`,
  );

const leaked = (cleaned.match(/<meta[^>]*>/gi) ?? []).filter((tag) =>
  /og:|twitter:|toolcraft-app-title|name=["']description["']/i.test(tag),
);
if (leaked.length > 0) {
  throw new Error(`Share metadata survived the build: ${leaked.join(" ")}`);
}
if (!cleaned.includes(`<title>${escapeHtml(pageTitle)}</title>`)) {
  throw new Error("The published page did not get its title.");
}
if (defaultMediaBaseShim && cleaned.indexOf(defaultMediaBaseShim) > cleaned.indexOf("<script type=\"module\"")) {
  throw new Error("The default-media base shim must run before the application module.");
}

writeFileSync(pagePath, cleaned);
console.log(
  `Cleaned ${pagePath}: no share metadata, title "${pageTitle}", favicon at ${normalizedBase}` +
    `${defaultMediaBaseShim ? ", default media rebased" : ""}.`,
);
