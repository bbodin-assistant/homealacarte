import assert from "node:assert/strict";
import { bootstrapApplication } from "../www/core/bootstrap.js";

const calls = [];
const legacySaved = {
  version: 10,
  language: "en",
  sources: [{ path: "house.json", content: "{}" }],
  people: [{ key: "alex" }],
  menu: [{ day: "Monday" }],
  stock: [{ item_key: "apple" }],
  customGrocery: [{ name: "Tea" }],
};
const state = { language: "fr", colorTheme: 3 };

await bootstrapApplication({
  state,
  requestedTab: "data",
  loadPrivateState: async () => legacySaved,
  applyColorTheme: (theme) => calls.push(["theme", theme]),
  applyTranslations: () => calls.push(["translations"]),
  switchTab: (tab) => calls.push(["tab", tab]),
  send: (...args) => calls.push(["send", ...args]),
});

assert.equal(state.language, "fr");
assert.equal(state.importedSources, null);
assert.equal(state.restorePeople, null);
assert.equal(state.restoreMenu, null);
assert.equal(state.restoreStock, null);
assert.equal(state.restoreCustom, null);
assert.deepEqual(calls, [
  ["theme", 3],
  ["translations"],
  ["tab", "data"],
  ["send", "load-bundled", {
    manifestUrl: "./data-manifest.json",
    language: "fr",
  }],
]);

const currentCalls = [];
const currentState = { language: "fr", colorTheme: 0, nonPersistingRequestIds: new Set() };
const currentSaved = {
  version: 12,
  language: "en",
  sources: [{
    path: "house.json",
    content: JSON.stringify({
      items: [], dishes: [], people: [], menu: [], stock: [], extra_needs: [],
    }),
  }],
};
await bootstrapApplication({
  state: currentState,
  requestedTab: "family",
  loadPrivateState: async () => currentSaved,
  applyColorTheme: () => {},
  applyTranslations: () => {},
  switchTab: () => {},
  send: (...args) => {
    currentCalls.push(args);
    return 42;
  },
});
assert.deepEqual(currentCalls, [["load-files", {
  files: currentSaved.sources,
  language: "en",
  source: "saved",
}]]);
assert.deepEqual([...currentState.nonPersistingRequestIds], [42]);

console.log("Bootstrap accepts only current private state and falls back cleanly for older versions.");
