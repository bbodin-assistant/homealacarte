import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, index, translations, guide] = await Promise.all([
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
  readFile(new URL("../www/translations.js", import.meta.url), "utf8"),
  readFile(new URL("../HOMEALACARTE_JSON_AGENT_GUIDE.md", import.meta.url), "utf8"),
]);

assert.match(index, /id="family-food-rule-add"/);
assert.match(index, /id="family-food-rules-list"/);
assert.match(app, /function familyFoodRulesPayload/);
assert.match(app, /food_rules: foodRules/);
assert.match(app, /data-food-rule-items] input:checked/);
assert.match(app, /data-food-rule-selected-items/);
assert.match(app, /function filterFoodRuleItems/);
assert.match(app, /results\.hidden = !query/);
assert.match(app, /data-food-rule-selected-item/);
assert.match(app, /data-food-rule-days] input:checked/);
assert.match(app, /days: kind !== "routine"/);
assert.match(translations, /food_rule_routine:/);
assert.match(translations, /food_rule_days:/);
assert.match(translations, /food_rule_never:/);
assert.match(guide, /"kind": "routine"/);
assert.match(guide, /"kind": "never"/);
assert.match(guide, /"days": \["monday"/);

console.log("Family profiles expose weekday-aware routine and never-propose rules.");
