import assert from "node:assert/strict";
import {
  createFormatters,
  displayCategory,
  escapeHtml,
  externalHttpUrl,
  formatInputNumber,
  normalizedCategory,
} from "../www/core/format.js";

let language = "en";
const messages = { bytes: "bytes", kilobytes: "KB", megabytes: "MB", never: "Never", unknown: "Unknown" };
const format = createFormatters(() => language, (key) => messages[key] || key);

assert.equal(escapeHtml(`<tag title="x">&'`), "&lt;tag title=&quot;x&quot;&gt;&amp;&#39;");
assert.equal(externalHttpUrl("javascript:alert(1)"), "");
assert.equal(externalHttpUrl("https://example.com/a"), "https://example.com/a");
assert.equal(formatInputNumber("nope"), "");
assert.equal(displayCategory("Food::Fruit"), "Food › Fruit");
assert.equal(normalizedCategory("Food › Fruit"), "Food::Fruit");
assert.equal(format.formatBytes(2048), "2 KB");
assert.match(format.formatMoney(12.5), /12\.50/);
language = "fr";
assert.match(format.formatMoney(12.5), /12,50/);

console.log("Shared formatters preserve localized and escaped output.");
