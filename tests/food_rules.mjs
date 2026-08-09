import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [feature, index, translations, guide] = await Promise.all([
  readFile(new URL("../www/features/family.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
  readFile(new URL("../www/translations.js", import.meta.url), "utf8"),
  readFile(new URL("../HOMEALACARTE_JSON_AGENT_GUIDE.md", import.meta.url), "utf8"),
]);

assert.match(index, /id="family-food-rule-add"/);
assert.match(index, /id="family-food-rules-list"/);
assert.match(feature, /function familyFoodRulesPayload/);
assert.match(feature, /food_rules: foodRules/);
assert.match(feature, /data-food-rule-items] input:checked/);
assert.match(feature, /data-food-rule-selected-items/);
assert.match(feature, /function filterFoodRuleItems/);
assert.match(feature, /results\.hidden = !query/);
assert.match(feature, /data-food-rule-selected-item/);
assert.match(feature, /data-food-rule-days] input:checked/);
assert.match(feature, /days: kind !== "routine"/);
assert.match(translations, /food_rule_routine:/);
assert.match(translations, /food_rule_days:/);
assert.match(translations, /food_rule_never:/);
assert.match(guide, /"kind": "routine"/);
assert.match(guide, /"kind": "never"/);
assert.match(guide, /"days": \["monday"/);

console.log("Family profiles expose weekday-aware routine and never-propose rules.");
