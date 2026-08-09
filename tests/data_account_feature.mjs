import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, feature] = await Promise.all([
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/data-account.js", import.meta.url), "utf8"),
]);

assert.match(app, /createDataAccountFeature/);
assert.match(app, /dataAccountFeature\.mount\(\)/);
assert.doesNotMatch(app, /#account-form.*addEventListener/);
assert.doesNotMatch(app, /#privacy-request-form.*addEventListener/);
assert.doesNotMatch(app, /#export-data.*addEventListener/);
assert.match(feature, /#account-form.*addEventListener/);
assert.match(feature, /#privacy-request-form.*addEventListener/);
assert.match(feature, /#export-data.*addEventListener/);
assert.match(feature, /deletePrivateData/);
assert.match(feature, /resolveSyncConflict/);
assert.doesNotMatch(feature, /\bt\(/);
assert.doesNotMatch(feature, /\blocalStorage\b/);

console.log("Data, account, privacy, import, export, and deletion UI have one feature owner.");
