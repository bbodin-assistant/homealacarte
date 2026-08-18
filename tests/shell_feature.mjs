import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, shell, entry] = await Promise.all([
  readFile(new URL("../www/app/feature-composition.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/shell.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
]);

assert.match(app, /createShellFeature/);
assert.match(app, /shellFeature\.mount\(\)/);
assert.match(app, /const locales = Object\.keys\(translations\)/);
assert.match(app, /locales,/);
assert.doesNotMatch(app, /document\.addEventListener\("click"/);
assert.doesNotMatch(app, /#confirm-dialog.*addEventListener/);
assert.match(shell, /documentRef\.addEventListener\("click"/);
assert.match(shell, /#confirm-dialog.*addEventListener/);
assert.match(shell, /function renderLanguageOptions/);
assert.match(shell, /locales\.map/);
assert.match(shell, /localeLabel/);
assert.match(shell, /requested\.split\("-"\)\[0\]/);
assert.match(shell, /function applyTranslations/);
assert.match(shell, /function resetPrimarySubview/);
assert.match(shell, /setMenuMode\("manual"\)/);
assert.match(shell, /setGroceryMode\("list"\)/);
assert.match(shell, /state\.itemCatalogueTab = "all"/);
assert.match(shell, /scrollPrimaryViewToTop/);
assert.match(shell, /switchTab\(nav\.dataset\.tab, true\)/);
assert.match(shell, /function switchTab/);
assert.match(shell, /dialogClosers\.forEach/);
assert.doesNotMatch(shell, /\bcloseFamilyDialog\b/);
assert.match(entry, /<select id="language-select"><\/select>/);
assert.doesNotMatch(entry, /<option value="(?:en|fr)">/);
assert.match(entry, /ingredient-incomplete-count[^>]+title="Incomplete catalogue items/);

console.log("The application shell owns shared navigation and resets main-button navigation to each view's first subtab and top.");
