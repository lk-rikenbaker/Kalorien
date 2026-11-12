// Erzeugt kalorien.html: eine einzelne, eigenständige HTML-Datei (öffnen per Doppelklick, kein Server nötig).
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const js = (await build({
  entryPoints: ["js/app.js"],
  bundle: true,
  format: "iife",
  platform: "browser",
  minify: true,
  write: false,
  legalComments: "eof",
})).outputFiles[0].text;

const css = readFileSync("styles.css", "utf8");
const icon = "data:image/svg+xml;base64," + Buffer.from(readFileSync("icons/icon.svg")).toString("base64");
// "</script" bzw. "<!--" im Code würden das Inline-Script beenden
const safeJs = js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

let html = readFileSync("index.html", "utf8")
  .replace(/\s*<link rel="manifest"[^>]*>/, "")
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${icon}">`)
  .replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="${icon}">`)
  .replace(/<link rel="stylesheet" href="styles.css">/, () => `<style>\n${css}</style>`)
  .replace(/<script type="module" src="js\/app.js"><\/script>/, () => `<script>\n${safeJs}</script>`);

writeFileSync("kalorien.html", html);
console.log(`kalorien.html geschrieben (${Math.round(html.length / 1024)} KB)`);
