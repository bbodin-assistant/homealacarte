export function mergeBundledFoodRules(savedPeople = [], bundledPeople = []) {
  const bundledByKey = new Map(bundledPeople.map((person) => [person.key, person]));
  return savedPeople.map((person) => {
    const bundledRules = bundledByKey.get(person.key)?.food_rules;
    if (!Array.isArray(bundledRules) || !bundledRules.length) return person;
    const existingRules = Array.isArray(person.food_rules) ? person.food_rules : [];
    const identities = new Set(existingRules.map(foodRuleIdentity));
    const missingRules = bundledRules.filter((rule) => !identities.has(foodRuleIdentity(rule)));
    if (!missingRules.length) return person;
    return {
      ...person,
      food_rules: [...existingRules, ...missingRules.map((rule) => ({
        ...rule,
        item_keys: [...(rule.item_keys || [])],
        days: [...(rule.days || [])],
      }))],
    };
  });
}

function foodRuleIdentity(rule = {}) {
  return JSON.stringify([
    rule.kind || "",
    rule.meal || "",
    [...(rule.item_keys || [])].sort(),
  ]);
}

export function mergeBundledDishClassifications(sources = [], bundledDishes = []) {
  const classifications = new Map(
    bundledDishes
      .filter((dish) => dish.auto_menu_main === false)
      .map((dish) => [dish.key, false]),
  );
  if (!classifications.size) return sources;
  return sources.map((source) => {
    let value;
    try {
      value = JSON.parse(source.content);
    } catch {
      return source;
    }
    if (!Array.isArray(value.dishes)) return source;
    let changed = false;
    value.dishes = value.dishes.map((dish) => {
      if (!classifications.has(dish.key) || dish.auto_menu_main === false) return dish;
      changed = true;
      return { ...dish, auto_menu_main: false };
    });
    return changed
      ? { ...source, content: `${JSON.stringify(value, null, 2)}\n` }
      : source;
  });
}

export async function loadBundledDefaults(manifestUrl = "./data-manifest.json") {
  const manifestResponse = await fetch(manifestUrl, { cache: "no-store" });
  if (!manifestResponse.ok) throw new Error(`Cannot load ${manifestUrl}`);
  const manifest = await manifestResponse.json();
  const people = [];
  const dishes = [];
  for (const path of manifest.files || []) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Cannot load ${path}`);
    const value = await response.json();
    if (Array.isArray(value.people)) people.push(...value.people);
    if (Array.isArray(value.dishes)) dishes.push(...value.dishes);
  }
  return { people, dishes };
}
