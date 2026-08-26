import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const registry = JSON.parse(await readFile(
  new URL("../locales/structural.json", import.meta.url),
  "utf8",
));

assert.equal(typeof registry.fallback, "string");
assert.ok(registry.locales[registry.fallback]);
assert.ok(Object.keys(registry.locales).length >= 3);
for (const [locale, strings] of Object.entries(registry.locales)) {
  assert.match(locale, /^[A-Za-z]{2}(?:-[A-Za-z0-9]{2,8})*$/);
  assert.deepEqual(Object.keys(strings.days), [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  ]);
  assert.deepEqual(Object.keys(strings.meals), [
    "breakfast", "morning_snack", "lunch", "afternoon_snack_1",
    "afternoon_snack_2", "dinner", "anytime",
  ]);
  assert.equal(typeof strings.categories, "object");
  assert.deepEqual(Object.keys(strings.messages), [
    "generated_automatically", "daily_routine",
  ]);
  assert.equal(typeof strings.pdf.grocery_title, "string");
  assert.ok(strings.pdf.grocery_title);
  assert.equal(typeof strings.pdf.decimal_separator, "string");
  assert.ok(strings.pdf.decimal_separator);
}
assert.equal(registry.locales.en.categories["Produce::Vegetables"], "Produce::Vegetables");
assert.equal(registry.locales.fr.categories["Produce::Vegetables"], "Fruits et légumes::Légumes");
assert.equal(registry.locales.es.categories["Produce::Vegetables"], "Productos::Verduras");

console.log("Structural locale registry is complete and data-driven across at least three locales.");
