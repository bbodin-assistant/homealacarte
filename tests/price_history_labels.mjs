import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const style = await readFile(new URL("../www/style.css", import.meta.url), "utf8");
const textRule = style.match(/\.price-history-chart text\s*\{([^}]*)\}/)?.[1] || "";

assert.match(textRule, /stroke:\s*none;/);
assert.match(textRule, /stroke-width:\s*0;/);
assert.match(textRule, /font-weight:\s*400;/);

console.log("Price-history labels override the global SVG stroke and render once.");
