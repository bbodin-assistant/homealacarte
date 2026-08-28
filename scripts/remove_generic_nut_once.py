#!/usr/bin/env python3
from pathlib import Path
import json
import re
import subprocess

LEGACY = "tree" + "_nut"
NUTS = [
    "almond", "hazelnut", "walnut", "cashew_nut",
    "pecan", "brazil_nut", "pistachio", "macadamia",
]


def load(path):
    return Path(path).read_text(encoding="utf-8")


def save(path, text):
    Path(path).write_text(text, encoding="utf-8")


def replace_once(path, old, new):
    text = load(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, found {count}: {old[:80]!r}")
    save(path, text.replace(old, new, 1))


# Browser allergen registry: named nut codes only, exact matching only.
path = "www/core/allergens.js"
text = load(path)
text = text.replace(
    '"peanut", "soy", "milk", "tree_nut", "almond"',
    '"peanut", "soy", "milk", "almond"',
)
text = text.replace('    tree_nut: "Fruits à coque", ', '    ')
text = text.replace(', tree_nut: "Tree nuts"', '')
text = text.replace("SPECIFIC_TREE_NUT_CODES", "NUT_CODES")
text = re.sub(r'^  tree_nut: .*\n', '', text, flags=re.M)
text = re.sub(
    r'\nexport function isSpecificTreeNut\(code\) \{\n  return NUT_CODES\.has\(code\);\n\}\n',
    '\n',
    text,
)
text = text.replace(
    '["peanut", "tree_nut", ...NUT_CODES]',
    '["peanut", ...NUT_CODES]',
)
text, count = re.subn(
    r'export function allergenCodesOverlap\(ruleAllergen, ingredientAllergen\) \{\n'
    r'  return ruleAllergen === ingredientAllergen\n'
    r'    \|\| \(ruleAllergen === "tree_nut" && NUT_CODES\.has\(ingredientAllergen\)\)\n'
    r'    \|\| \(ingredientAllergen === "tree_nut" && NUT_CODES\.has\(ruleAllergen\)\);\n'
    r'\}',
    'export function allergenCodesOverlap(ruleAllergen, ingredientAllergen) {\n'
    '  return ruleAllergen === ingredientAllergen\n'
    '    && ALLERGEN_CODES.includes(ruleAllergen);\n'
    '}',
    text,
    count=1,
)
if count != 1:
    raise SystemExit("www/core/allergens.js: overlap function not patched")
save(path, text)

# Catalogue no longer needs mutual-exclusion logic for a generic code.
path = "www/features/catalogue/allergens.js"
text = load(path)
text = text.replace(
    '  allergenLabel,\n  isSpecificTreeNut,\n',
    '  allergenLabel,\n',
)
text, count = re.subn(
    r'\nexport function enforceIngredientTreeNutSelection\(container, changedInput\) \{.*?\n\}\n',
    '\n',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("catalogue allergen enforcement function not removed")
save(path, text)

replace_once(
    "www/features/catalogue.js",
    'import { enforceIngredientTreeNutSelection, ingredientAllergenBadges, ingredientAllergenOptions } from "./catalogue/allergens.js?v=homealacarte-100";',
    'import { ingredientAllergenBadges, ingredientAllergenOptions } from "./catalogue/allergens.js?v=homealacarte-100";',
)
replace_once(
    "www/features/catalogue.js",
    'select("#ingredient-form").addEventListener("change", (event) => {\n'
    '  if (event.target.matches("#ingredient-allergens input")) enforceIngredientTreeNutSelection(select("#ingredient-allergens"), event.target);\n'
    '  updateIngredientSaveState();\n'
    '});',
    'select("#ingredient-form").addEventListener("change", updateIngredientSaveState);',
)

# Dish filters and household allergy badges use exact codes only.
path = "www/features/dishes.js"
text = load(path)
text = text.replace(
    '  allergenLabel,\n  isSpecificTreeNut,\n',
    '  allergenLabel,\n',
)
text, count = re.subn(
    r'export function dishFilterAllergenMatches\(selectedAllergen, ingredientAllergen\) \{\n'
    r'  if \(selectedAllergen === "tree_nut"\) \{\n'
    r'    return ingredientAllergen === "tree_nut" \|\| isSpecificTreeNut\(ingredientAllergen\);\n'
    r'  \}\n'
    r'  return selectedAllergen === ingredientAllergen;\n'
    r'\}',
    'export function dishFilterAllergenMatches(selectedAllergen, ingredientAllergen) {\n'
    '  return selectedAllergen === ingredientAllergen\n'
    '    && ALLERGEN_CODES.includes(selectedAllergen);\n'
    '}',
    text,
    count=1,
)
if count != 1:
    raise SystemExit("dish filter generic nut helper not patched")
save(path, text)

# Rust runtime: generic code is not canonical. It is accepted only as legacy input
# and expanded immediately into the eight explicit nut codes.
path = "src/model.rs"
text = load(path)
text = text.replace(
    '/// Canonical codes for the major regulated food allergens, with individual\n'
    '/// tree nuts kept separate so a profile can be as precise as the diagnosis.\n'
    'pub const ALLERGEN_CODES: [&str; 27] = [',
    '/// Canonical codes for the major regulated food allergens. Nut allergens are\n'
    '/// represented only by explicit named codes.\n'
    'pub const ALLERGEN_CODES: [&str; 26] = [',
)
text = text.replace('    "tree_nut",\n', '', 1)
marker = '];\n\n#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct SourceFile'
insert = '''];

pub const NUT_ALLERGEN_CODES: [&str; 8] = [
    "almond",
    "hazelnut",
    "walnut",
    "cashew_nut",
    "pecan",
    "brazil_nut",
    "pistachio",
    "macadamia",
];

pub const LEGACY_GENERIC_NUT_CODE: &str = concat!("tree", "_nut");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceFile'''
if marker not in text:
    raise SystemExit("src/model.rs: insertion marker missing")
text = text.replace(marker, insert, 1)
save(path, text)

path = "src/loader/mod.rs"
old = '''        let allergens = input
            .allergens
            .into_iter()
            .map(|allergen| allergen.trim().to_lowercase())
            .filter(|allergen| !allergen.is_empty() && seen_allergens.insert(allergen.clone()))
            .collect::<Vec<_>>();'''
new = '''        let allergens = input
            .allergens
            .into_iter()
            .flat_map(|allergen| {
                let allergen = allergen.trim().to_lowercase();
                if allergen == crate::model::LEGACY_GENERIC_NUT_CODE {
                    crate::model::NUT_ALLERGEN_CODES
                        .iter()
                        .map(|code| (*code).to_string())
                        .collect::<Vec<_>>()
                } else {
                    vec![allergen]
                }
            })
            .filter(|allergen| !allergen.is_empty() && seen_allergens.insert(allergen.clone()))
            .collect::<Vec<_>>();'''
replace_once(path, old, new)

path = "src/loader/menu.rs"
old = '''        rule.allergens = rule
            .allergens
            .into_iter()
            .map(|allergen| allergen.trim().to_lowercase())
            .filter(|allergen| !allergen.is_empty() && allergens.insert(allergen.clone()))
            .collect();'''
new = '''        rule.allergens = rule
            .allergens
            .into_iter()
            .flat_map(|allergen| {
                let allergen = allergen.trim().to_lowercase();
                if allergen == crate::model::LEGACY_GENERIC_NUT_CODE {
                    crate::model::NUT_ALLERGEN_CODES
                        .iter()
                        .map(|code| (*code).to_string())
                        .collect::<Vec<_>>()
                } else {
                    vec![allergen]
                }
            })
            .filter(|allergen| !allergen.is_empty() && allergens.insert(allergen.clone()))
            .collect();'''
replace_once(path, old, new)

path = "src/optimizer/rules.rs"
text = load(path)
text, count = re.subn(
    r'\nfn is_specific_tree_nut\(allergen: &str\) -> bool \{.*?\n\}\n\n'
    r'fn allergens_overlap\(rule_allergen: &str, ingredient_allergen: &str\) -> bool \{.*?\n\}',
    '\nfn allergens_overlap(rule_allergen: &str, ingredient_allergen: &str) -> bool {\n'
    '    rule_allergen == ingredient_allergen\n'
    '}',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("optimizer generic nut overlap not patched")
text, count = re.subn(
    r'    #\[test\]\n'
    r'    fn specific_nut_allergies_conservatively_block_generic_tree_nut_labels\(\) \{.*?\n'
    r'    \}\n\n'
    r'    #\[test\]',
    '''    #[test]
    fn specific_nut_allergies_match_only_the_same_named_nut() {
        let cream = ingredient("nut_cream", &["hazelnut"]);
        let ingredients = HashMap::from([(cream.key.as_str(), &cream)]);
        let mut allergy = rule("allergy", "placeholder");
        allergy.item_keys.clear();
        allergy.allergens = vec!["pistachio".to_string()];
        let allergic = person(vec![allergy]);

        assert!(!person_forbids_item(
            &allergic,
            "nut_cream",
            "Afternoon snack",
            "en",
            &ingredients,
            &HashMap::new(),
        ));
    }

    #[test]''',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("optimizer generic nut test not patched")
save(path, text)

# JS tests: exact named-nut semantics.
save("tests/allergens.mjs", '''import assert from "node:assert/strict";
import {
  ALLERGEN_CODES,
  allergenCodesOverlap,
  allergenIcon,
  allergenIconSvg,
  allergenLabel,
} from "../www/core/allergens.js";

assert.equal(ALLERGEN_CODES.length, 26);
assert.equal(new Set(ALLERGEN_CODES).size, ALLERGEN_CODES.length);
assert.equal(ALLERGEN_CODES.includes(["tree", "nut"].join("_")), false);
assert.equal(allergenLabel("hazelnut", "fr"), "Noisettes");
assert.equal(allergenLabel("hazelnut", "en"), "Hazelnuts");
assert.equal(allergenIcon("hazelnut"), "🥜");
assert.equal(allergenIcon("Peanut butter"), "🥜");
const allergenSvgs = ALLERGEN_CODES.map(allergenIconSvg);
assert.ok(allergenSvgs.every((svg) => svg.startsWith("<svg")));
assert.equal(new Set(allergenSvgs).size, ALLERGEN_CODES.length);
assert.ok(allergenIconSvg("sesame").includes("ellipse"));
assert.ok(allergenIconSvg("crustacean").includes("circle"));
assert.equal(allergenCodesOverlap("hazelnut", "hazelnut"), true);
assert.equal(allergenCodesOverlap("pistachio", "hazelnut"), false);
assert.equal(allergenCodesOverlap(["tree", "nut"].join("_"), "hazelnut"), false);

console.log("Allergen registry provides explicit stable codes, localized labels, dedicated SVG icons, and exact matching.");
''')

path = "tests/dishes_feature.mjs"
text = load(path)
text = text.replace(
    'components: [{ key: "mixed_nuts", name: "Mixed nuts", allergens: ["tree_nut"] }]',
    'components: [{ key: "walnut", name: "Walnut", allergens: ["walnut"] }]',
)
old = '''assert.equal(allergenCodesOverlap("pistachio", "tree_nut"), true);
assert.equal(allergenCodesOverlap("tree_nut", "walnut"), true);
assert.equal(allergenCodesOverlap("pistachio", "walnut"), false);
assert.equal(dishFilterAllergenMatches("tree_nut", "brazil_nut"), true);
assert.equal(dishFilterAllergenMatches("brazil_nut", "brazil_nut"), true);
assert.equal(dishFilterAllergenMatches("brazil_nut", "tree_nut"), false);'''
new = '''assert.equal(allergenCodesOverlap("pistachio", "pistachio"), true);
assert.equal(allergenCodesOverlap("pistachio", "walnut"), false);
assert.equal(dishFilterAllergenMatches("brazil_nut", "brazil_nut"), true);
assert.equal(dishFilterAllergenMatches("brazil_nut", "walnut"), false);'''
replace_once(path, old, new)
text = load(path)
text, count = re.subn(
    r'assert\.ok\(!filterDishes\(dishes, \{ \.\.\.baseFilters, allergens: new Set\(\["tree_nut"\]\) \}\)\n'
    r'  \.some\(\(dish\) => dish\.key === "carrot_cake"\)\);\n',
    '',
    text,
    count=1,
)
if count != 1:
    raise SystemExit("dishes generic filter assertion not removed")
save(path, text)

path = "tests/catalogue_allergens_browser.mjs"
text = load(path)
text = text.replace('assert.doesNotMatch(initialBadge, /Tree nuts|Fruits à coque/);\n', '')
replace_old = '''await waitFor(
  `!document.querySelector("#ingredient-form").hidden
    && document.querySelector('#ingredient-allergens input[value="hazelnut"]:checked')
    && !document.querySelector('#ingredient-allergens input[value="tree_nut"]:checked')`,
  "the populated allergen editor",
);'''
replace_new = '''await waitFor(
  `!document.querySelector("#ingredient-form").hidden
    && document.querySelector('#ingredient-allergens input[value="hazelnut"]:checked')`,
  "the populated allergen editor",
);'''
if replace_old not in text:
    raise SystemExit("catalogue browser populated allergen wait not found")
text = text.replace(replace_old, replace_new, 1)
start = text.find("\nawait evaluate(`(() => {\n  const input = document.querySelector('#ingredient-allergens input[value=\"tree_nut\"]');")
end_marker = "assert.equal(await evaluate(`Boolean(document.querySelector('#ingredient-allergens input[value=\"hazelnut\"]:checked'))`), true);\n"
if start < 0:
    raise SystemExit("catalogue browser generic interaction start not found")
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit("catalogue browser generic interaction end not found")
text = text[:start] + "\n" + text[end + len(end_marker):]
text = text.replace('assert.doesNotMatch(detailAllergens, /Tree nuts|Fruits à coque/);\n', '')
save(path, text)

# Migrate bundled/sample JSON data without rewriting unaffected files.
def migrate(value):
    changed = False
    if isinstance(value, dict):
        for key, entry in list(value.items()):
            if key == "allergens" and isinstance(entry, list) and LEGACY in entry:
                expanded = []
                for code in entry:
                    expanded.extend(NUTS if code == LEGACY else [code])
                value[key] = list(dict.fromkeys(expanded))
                changed = True
            else:
                changed = migrate(entry) or changed
    elif isinstance(value, list):
        for entry in value:
            changed = migrate(entry) or changed
    return changed


for json_path in Path(".").rglob("*.json"):
    if any(part in {"target", "dist", "node_modules"} for part in json_path.parts):
        continue
    try:
        value = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception:
        continue
    if migrate(value):
        json_path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

# Delete one-shot machinery before committing the real change.
Path(".github/workflows/remove-generic-nut.yml").unlink()
Path("scripts/remove_generic_nut_once.py").unlink()

result = subprocess.run(["git", "grep", "-n", LEGACY], text=True, capture_output=True)
if result.returncode == 0:
    raise SystemExit("legacy generic nut code remains:\n" + result.stdout)
if result.returncode not in (0, 1):
    raise SystemExit(result.stderr)
