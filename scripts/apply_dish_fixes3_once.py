#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, found {count}: {old[:80]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path, pattern, replacement):
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, found {count}: {pattern}")
    write(path, updated)


allergen_display = '''import {
  ALLERGEN_CODES,
  allergenCodesOverlap,
  allergenIconSvg,
  allergenLabel,
} from "../../core/allergens.js?v=homealacarte-103";

function componentAllergenCodes(component) {
  const seen = new Set();
  return (component?.allergens || [])
    .map((code) => String(code || "").trim().toLowerCase())
    .filter((code) => ALLERGEN_CODES.includes(code) && !seen.has(code) && seen.add(code));
}

export function dishAllergenCodes(dish) {
  const seen = new Set();
  const codes = [];
  for (const component of dish?.components || []) {
    for (const code of componentAllergenCodes(component)) {
      if (!seen.has(code)) {
        seen.add(code);
        codes.push(code);
      }
    }
  }
  return codes;
}

export function dishAllergenBadges(dish, people = [], language) {
  const codes = dishAllergenCodes(dish);
  const affectedByCode = new Map(codes.map((code) => [code, new Set()]));
  const components = new Map((dish?.components || []).map((component) => [component.key, component]));
  const itemWarnings = new Map();

  for (const person of people || []) {
    for (const rule of person.food_rules || []) {
      if (rule.kind !== "allergy") continue;
      for (const key of rule.item_keys || []) {
        const component = components.get(key);
        if (!component) continue;
        const componentCodes = componentAllergenCodes(component);
        if (componentCodes.length) {
          componentCodes.forEach((code) => affectedByCode.get(code)?.add(person.name));
        } else {
          const entry = itemWarnings.get(key) || {
            kind: "allergy",
            code: "",
            label: component.name || key,
            icon: allergenIconSvg(""),
            people: new Set(),
            householdWarning: true,
          };
          entry.people.add(person.name);
          itemWarnings.set(key, entry);
        }
      }
      for (const ruleAllergen of rule.allergens || []) {
        for (const code of codes) {
          if (allergenCodesOverlap(ruleAllergen, code)) {
            affectedByCode.get(code)?.add(person.name);
          }
        }
      }
    }
  }

  const badges = codes.map((code) => {
    const label = allergenLabel(code, language);
    const affectedPeople = [...(affectedByCode.get(code) || [])];
    return {
      kind: "allergy",
      code,
      label,
      icon: allergenIconSvg(code),
      title: affectedPeople.length ? `${label} · ${affectedPeople.join(", ")}` : label,
      householdWarning: affectedPeople.length > 0,
    };
  });

  for (const warning of itemWarnings.values()) {
    const peopleNames = [...warning.people];
    badges.push({
      kind: warning.kind,
      code: warning.code,
      label: warning.label,
      icon: warning.icon,
      title: peopleNames.length ? `${warning.label} · ${peopleNames.join(", ")}` : warning.label,
      householdWarning: true,
    });
  }
  return badges;
}
'''
write("www/features/dishes/allergen-display.js", allergen_display)

replace_once(
    "www/features/dishes.js",
    'import { matchesSelectedNutriScores } from "./dishes/filters.js?v=homealacarte-77";\n',
    'import { matchesSelectedNutriScores } from "./dishes/filters.js?v=homealacarte-77";\nimport { dishAllergenBadges, dishAllergenCodes } from "./dishes/allergen-display.js?v=homealacarte-103";\n',
)

new_preference = '''export { dishAllergenCodes };

export function dishPreferenceBadges(dish, people = [], language) {
  const components = new Map((dish.components || []).map((component) => [component.key, component]));
  const badges = [];
  const favoritePeople = [];
  const forbiddenPeople = [];

  for (const person of people || []) {
    for (const rule of person.food_rules || []) {
      if (rule.kind === "favorite" && (rule.item_keys || []).includes(dish.key)) {
        favoritePeople.push(person.name);
      }
      if (rule.kind === "never") {
        const matchesDish = (rule.item_keys || []).some((key) => key === dish.key || components.has(key));
        if (matchesDish) forbiddenPeople.push(person.name);
      }
    }
  }

  if (favoritePeople.length) {
    badges.push({ kind: "favorite", icon: "❤️", title: `Favorite: ${favoritePeople.join(", ")}` });
  }
  if (forbiddenPeople.length) {
    badges.push({ kind: "forbidden", icon: "⛔", title: `Forbidden: ${[...new Set(forbiddenPeople)].join(", ")}` });
  }
  badges.push(...dishAllergenBadges(dish, people, language));
  return badges;
}

export function dishRangeMaximums'''
regex_once(
    "www/features/dishes.js",
    r'function componentAllergenIcon\(component, key\) \{.*?export function dishRangeMaximums',
    new_preference,
)

replace_once(
    "www/features/dishes.js",
    '<span class="dish-preference-badge ${escapeHtml(badge.kind)}" title="${escapeHtml(badge.title)}" aria-label="${escapeHtml(badge.title)}">${badge.icon}</span>',
    '<span class="dish-preference-badge ${escapeHtml(badge.kind)}${badge.householdWarning ? " household-warning" : ""}" title="${escapeHtml(badge.title)}" aria-label="${escapeHtml(badge.title)}">${badge.icon}</span>',
)
replace_once(
    "www/features/dishes.js",
    'preferenceBadges.some((badge) => badge.kind === "allergy" || badge.kind === "forbidden")',
    'preferenceBadges.some((badge) => badge.kind === "forbidden" || badge.householdWarning)',
)
replace_once(
    "www/features/dishes.js",
    '<div class="dish-title"><h2>${originFlag ? `<span class="dish-origin-flag" title="${escapeHtml(dish.origin_country)}" aria-hidden="true">${originFlag}</span> ` : ""}${escapeHtml(dish.name)}${badgeMarkup ? ` <span class="dish-preference-badges">${badgeMarkup}</span>` : ""}</h2></div>',
    '<div class="dish-title"><h2>${originFlag ? `<span class="dish-origin-flag" title="${escapeHtml(dish.origin_country)}" aria-hidden="true">${originFlag}</span> ` : ""}${escapeHtml(dish.name)}</h2>${badgeMarkup ? `<span class="dish-preference-badges">${badgeMarkup}</span>` : ""}</div>',
)

replace_once(
    "www/features/menu.js",
    'import { countryFlag } from "../core/data-localization.js?v=homealacarte-80";\n',
    'import { countryFlag } from "../core/data-localization.js?v=homealacarte-80";\nimport { dishAllergenBadges } from "./dishes/allergen-display.js?v=homealacarte-103";\n',
)
allergen_detail_block = '''    const allergenBadges = dish
      ? dishAllergenBadges(dish, state.snapshot.people || [], state.language)
        .filter((badge) => badge.code)
      : [];
    select("#dish-details-allergens-section").hidden = allergenBadges.length === 0;
    select("#dish-details-allergens").innerHTML = allergenBadges.map((badge) => `
      <span class="dish-details-allergen${badge.householdWarning ? " household-warning" : ""}" title="${escapeHtml(badge.title)}">
        <span class="dish-details-allergen-icon" aria-hidden="true">${badge.icon}</span>
        <strong>${escapeHtml(badge.label)}</strong>
      </span>
    `).join("");

    select("#dish-details-metrics").hidden = !dish;'''
replace_once(
    "www/features/menu.js",
    '    select("#dish-details-metrics").hidden = !dish;',
    allergen_detail_block,
)

replace_once(
    "www/views/dialogs.html",
    '''          <p id="dish-details-nutri-status" class="nutri-score-detail"></p>
          <section id="dish-details-ingredients-section">''',
    '''          <p id="dish-details-nutri-status" class="nutri-score-detail"></p>
          <section id="dish-details-allergens-section" hidden>
            <h3 data-i18n="allergens">Allergènes</h3>
            <div id="dish-details-allergens" class="dish-details-allergens"></div>
          </section>
          <section id="dish-details-ingredients-section">''',
)

css = read("www/styles/ui-refinements.css")
css += '''

/* Dish follow-up: popovers escape the filter frame and allergen warnings stay visible. */
.dish-filter-panel.panel {
  position: relative;
  z-index: 5;
  overflow: visible;
}
.dish-filter-picker[open] { z-index: 30; }
.dish-title {
  min-height: 0;
  display: grid;
  gap: 8px;
}
.dish-preference-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}
.dish-preference-badge.allergy,
.dish-details-allergen-icon {
  width: 28px;
  height: 28px;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  padding: 4px;
  color: #b52f2a;
  background: #fff1ef;
  border: 2px solid #d14b42;
  border-radius: 50%;
  box-sizing: border-box;
  box-shadow: 0 1px 4px rgba(145, 38, 31, .12);
}
.dish-preference-badge.allergy svg,
.dish-details-allergen-icon svg { width: 100%; height: 100%; display: block; }
.dish-preference-badge.allergy.household-warning,
.dish-details-allergen.household-warning .dish-details-allergen-icon {
  color: #fff;
  background: #bf352c;
  border-color: #98271f;
  box-shadow: 0 0 0 2px rgba(191, 53, 44, .14), 0 2px 7px rgba(105, 24, 19, .18);
}
.dish-details-allergens {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dish-details-allergen {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 9px 5px 5px;
  color: #7d211c;
  background: #fff8f6;
  border: 1px solid #ecc0bc;
  border-radius: 999px;
}
.dish-details-allergen strong { font-size: 10px; }
.dish-details-allergen.household-warning {
  color: #7a1f1a;
  border-color: #d9918a;
  background: #fff0ed;
}
'''
write("www/styles/ui-refinements.css", css)

replace_once(
    "www/app/feature-composition.js",
    'import { createDishesFeature } from "../features/dishes.js?v=homealacarte-100";',
    'import { createDishesFeature } from "../features/dishes.js?v=homealacarte-103";',
)
replace_once(
    "www/app/feature-composition.js",
    'import { createMenuFeature } from "../features/menu.js?v=homealacarte-81";',
    'import { createMenuFeature } from "../features/menu.js?v=homealacarte-103";',
)
replace_once(
    "www/app.js",
    'import { createFeatureComposition } from "./app/feature-composition.js?v=homealacarte-102";',
    'import { createFeatureComposition } from "./app/feature-composition.js?v=homealacarte-103";',
)
replace_once(
    "www/index.html",
    '<link rel="stylesheet" href="./styles/ui-refinements.css">',
    '<link rel="stylesheet" href="./styles/ui-refinements.css?v=homealacarte-103">',
)
replace_once(
    "www/index.html",
    '<small class="app-version" aria-label="Version de l’application">v102</small>',
    '<small class="app-version" aria-label="Version de l’application">v103</small>',
)
replace_once(
    "www/index.html",
    '<script type="module" src="./app.js?v=homealacarte-102"></script>',
    '<script type="module" src="./app.js?v=homealacarte-103"></script>',
)

replace_once(
    "tests/dishes_feature.mjs",
    'import assert from "node:assert/strict";\n',
    'import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\n',
)
replace_once(
    "tests/dishes_feature.mjs",
    '  dishFilterAllergenMatches,\n  dishPreferenceBadges,',
    '  dishFilterAllergenMatches,\n  dishAllergenCodes,\n  dishPreferenceBadges,',
)
replace_once(
    "tests/dishes_feature.mjs",
    'assert.match(badges.find((badge) => badge.kind === "allergy")?.title || "", /Alex/);\n',
    '''assert.match(badges.find((badge) => badge.kind === "allergy")?.title || "", /Alex/);
assert.equal(badges.find((badge) => badge.kind === "allergy")?.householdWarning, true);

const multiAllergenDish = {
  key: "custard_toast",
  components: [
    { key: "custard", name: "Custard", allergens: ["milk", "egg"] },
    { key: "topping", name: "Sesame topping", allergens: ["sesame", "milk"] },
  ],
};
assert.deepEqual(dishAllergenCodes(multiAllergenDish), ["milk", "egg", "sesame"]);
const allDishAllergenBadges = dishPreferenceBadges(multiAllergenDish, [], "en")
  .filter((badge) => badge.kind === "allergy");
assert.deepEqual(allDishAllergenBadges.map((badge) => badge.code), ["milk", "egg", "sesame"]);
assert.ok(allDishAllergenBadges.every((badge) => badge.icon.startsWith("<svg")));
assert.ok(allDishAllergenBadges.every((badge) => badge.householdWarning === false));

const dialogSource = readFileSync(new URL("../www/views/dialogs.html", import.meta.url), "utf8");
const refinementSource = readFileSync(new URL("../www/styles/ui-refinements.css", import.meta.url), "utf8");
assert.match(dialogSource, /dish-details-allergens-section/);
assert.match(dialogSource, /dish-details-allergens/);
assert.match(refinementSource, /\.dish-filter-panel\.panel[\\s\\S]*?overflow:\s*visible/);
assert.match(refinementSource, /\.dish-preference-badge\.allergy[\\s\\S]*?border-radius:\s*50%/);
''',
)

print("Applied dish filter and allergen display fixes.")
