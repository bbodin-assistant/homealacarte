import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, shell] = await Promise.all([
  readFile(new URL("../www/app/feature-composition.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/shell.js", import.meta.url), "utf8"),
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
assert.match(shell, /function applyTranslations/);
assert.match(shell, /function switchTab/);
assert.match(shell, /dialogClosers\.forEach/);
assert.doesNotMatch(shell, /\bcloseFamilyDialog\b/);

console.log("The application shell owns navigation, locale-driven language selection, rendering, and shared dialogs.");
