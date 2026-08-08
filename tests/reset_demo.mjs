import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import init, { HomeALaCarteEngine } from "../dist/pkg/homealacarte_web.js";

const distUrl = new URL("../dist/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("demo-data-manifest.json", distUrl), "utf8"));
const sources = await Promise.all(manifest.files.map(async (path) => ({
  path: path.replace(/^data\//, ""),
  content: await readFile(new URL(path, distUrl), "utf8"),
})));
const wasmUrl = new URL("pkg/homealacarte_web_bg.wasm", distUrl);

await init({ module_or_path: await readFile(wasmUrl) });
const engine = new HomeALaCarteEngine();
const snapshot = engine.load(sources, { language: "fr" });

assert.ok(snapshot.ingredients.length > 0, "reset demo should contain food items");
assert.ok(snapshot.dishes.length > 0, "reset demo should contain dishes");
assert.ok(snapshot.people.length > 0, "reset demo should restore household people");
assert.ok(snapshot.planner.length > 0, "reset demo should restore the menu");

const index = await readFile(new URL("index.html", distUrl), "utf8");
const app = await readFile(new URL("app.js", distUrl), "utf8");
const worker = await readFile(new URL("worker.js", distUrl), "utf8");
assert.match(index, /app\.js\?v=homealacarte-75/);
assert.match(index, /class="app-version"[^>]*>v75<\/small>/);
assert.match(app, /manifestUrl: "\.\/demo-data-manifest\.json"/);
assert.match(worker, /homealacarte_web_bg\.wasm\?v=homealacarte-75/);
const buildMeta = JSON.parse(await readFile(new URL("build-meta.json", distUrl), "utf8"));
assert.equal(buildMeta.version, "75");

console.log(
  `Reset demo loaded from ${fileURLToPath(wasmUrl)}: `
  + `${snapshot.ingredients.length} foods, ${snapshot.dishes.length} dishes, `
  + `${snapshot.people.length} people, ${snapshot.planner.length} menu entries.`,
);
