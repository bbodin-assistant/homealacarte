import assert from "node:assert/strict";
import { createThemeController } from "../www/core/theme.js";

const state = { colorTheme: 0, randomThemes: [] };
const saved = new Map();
const properties = new Map();
const controller = createThemeController(
  state,
  { setItem: (key, value) => saved.set(key, value) },
  { setProperty: (key, value) => properties.set(key, value) },
);

controller.apply(1);
assert.equal(state.colorTheme, 1);
assert.equal(state.randomThemes.length, 6);
assert.ok(properties.has("--surface-strong"));
controller.randomize();
assert.equal(state.colorTheme, 2);
assert.equal(saved.get("homealacarte-color-theme"), "2");

console.log("Theme state and CSS variable application remain isolated and deterministic in shape.");
