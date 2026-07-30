import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import init, { HomeALaCarteEngine } from "../pkg/homealacarte_web.js";

const importPath = process.argv[2];
assert.ok(importPath, "usage: personal_import.mjs <personal-import.json>");
const content = await readFile(importPath, "utf8");
const input = JSON.parse(content);
const wasm = await readFile(new URL("../pkg/homealacarte_web_bg.wasm", import.meta.url));

await init({ module_or_path: wasm });
const engine = new HomeALaCarteEngine();
const snapshot = engine.load(
  [{ path: "homealacarte.json", content }],
  { language: "fr" },
);
const exported = JSON.parse(engine.export_data("consolidated"));

const notesByRow = (document) => new Map(
  ["stock", "extra_needs"].flatMap((section) =>
    document[section]
      .filter((row) => row.notes)
      .map((row) => [`${section}:${row.item_key}`, row.notes])),
);
assert.deepEqual(notesByRow(exported), notesByRow(input));
const priceHistoryByItem = (document) => new Map(
  document.items.map((item) => [item.key, item.price_history || []]),
);
assert.deepEqual(priceHistoryByItem(exported), priceHistoryByItem(input));
assert.equal(
  new Set(exported.items.map((item) => item.key)).size,
  exported.items.length,
  "item keys must be unique",
);
assert.equal(
  new Set(exported.dishes.map((dish) => dish.key)).size,
  exported.dishes.length,
  "dish keys must be unique",
);

console.log(
  `Personal import accepted by browser engine: ${snapshot.counts.ingredients} foods, `
  + `${snapshot.counts.household_items} household items, ${snapshot.counts.dishes} dishes, `
  + `${snapshot.counts.people} people, ${snapshot.counts.menu} menu rows, `
  + `${notesByRow(exported).size} preserved stock/need notes, `
  + `${[...priceHistoryByItem(exported).values()].reduce((total, rows) => total + rows.length, 0)} price observations.`,
);
