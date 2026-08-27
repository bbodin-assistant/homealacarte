import assert from "node:assert/strict";
import { bootstrapApplication } from "../www/core/bootstrap.js";

const calls = [];
const saved = {
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
  loadPrivateState: async () => saved,
  applyColorTheme: (theme) => calls.push(["theme", theme]),
  applyTranslations: () => calls.push(["translations"]),
  switchTab: (tab) => calls.push(["tab", tab]),
  send: (...args) => calls.push(["send", ...args]),
});

assert.equal(state.language, "en");
assert.deepEqual(state.restorePeople, saved.people);
assert.deepEqual(state.restoreMenu, saved.menu);
assert.deepEqual(state.restoreStock, saved.stock);
assert.deepEqual(state.restoreCustom, saved.customGrocery);
assert.deepEqual(calls, [
  ["theme", 3],
  ["translations"],
  ["tab", "data"],
  ["translations"],
  ["send", "load-files", {
    files: saved.sources,
    language: "en",
    source: "saved",
  }],
]);

console.log("Bootstrap restores current private state and routes the initial load deterministically.");

const currentCalls = [];
const currentState = { language: "fr", colorTheme: 0, nonPersistingRequestIds: new Set() };
await bootstrapApplication({
  state: currentState,
  requestedTab: "family",
  loadPrivateState: async () => ({ ...saved, version: 11 }),
  applyColorTheme: () => {},
  applyTranslations: () => {},
  switchTab: () => {},
  send: (...args) => {
    currentCalls.push(args);
    return 42;
  },
});
assert.deepEqual(currentCalls, [["load-files", {
  files: saved.sources,
  language: "en",
  source: "saved",
}]]);
assert.deepEqual([...currentState.nonPersistingRequestIds], [42]);
