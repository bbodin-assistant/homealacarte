export function mergeBundledFoodRules(savedPeople = [], bundledPeople = []) {
  const bundledByKey = new Map(bundledPeople.map((person) => [person.key, person]));
  return savedPeople.map((person) => {
    const bundledRules = bundledByKey.get(person.key)?.food_rules;
    if (!Array.isArray(bundledRules) || !bundledRules.length) return person;
    const existingRules = Array.isArray(person.food_rules) ? person.food_rules : [];
    let updated = false;
    const migratedRules = existingRules.map((existing) => {
      if (existing.period_start || existing.period_end) return existing;
      const seasonalDefault = bundledRules.find((rule) => (
        rule.period_start
        && rule.period_end
        && foodRuleIdentity(rule) === foodRuleIdentity(existing)
        && sameFoodRuleExceptPeriod(rule, existing)
      ));
      if (!seasonalDefault) return existing;
      updated = true;
      return {
        ...existing,
        period_start: seasonalDefault.period_start,
        period_end: seasonalDefault.period_end,
      };
    });
    const identities = new Set(migratedRules.map(foodRuleIdentity));
    const missingRules = bundledRules.filter((rule) => !identities.has(foodRuleIdentity(rule)));
    if (!missingRules.length && !updated) return person;
    return {
      ...person,
      food_rules: [...migratedRules, ...missingRules.map((rule) => ({
        ...rule,
        item_keys: [...(rule.item_keys || [])],
        days: [...(rule.days || [])],
      }))],
    };
  });
}

function sameFoodRuleExceptPeriod(left = {}, right = {}) {
  const normalized = (rule) => JSON.stringify([
    rule.kind || "",
    rule.meal || "",
    [...(rule.item_keys || [])],
    [...(rule.allergens || [])],
    [...(rule.days || [])],
    rule.quantity ?? 1,
    rule.quantity_unit || "portion",
  ]);
  return normalized(left) === normalized(right);
}

export function mergeBundledFoodRulesInSources(sources = [], bundledPeople = []) {
  return sources.map((source) => {
    let value;
    try {
      value = JSON.parse(source.content);
    } catch {
      return source;
    }
    if (!Array.isArray(value.people)) return source;
    const people = mergeBundledFoodRules(value.people, bundledPeople);
    if (people.every((person, index) => person === value.people[index])) return source;
    return {
      ...source,
      content: `${JSON.stringify({ ...value, people }, null, 2)}\n`,
    };
  });
}

export function mergeBundledFoodRuleDependencies(
  sources = [],
  bundledPeople = [],
  bundledDishes = [],
  bundledItems = [],
) {
  const existingItems = new Set();
  const existingDishes = new Set();
  for (const source of sources) {
    try {
      const value = JSON.parse(source.content);
      (value.items || []).forEach((item) => existingItems.add(item.key));
      (value.dishes || []).forEach((dish) => existingDishes.add(dish.key));
    } catch {
      // Invalid sources are left to the regular loader error path.
    }
  }
  const itemsByKey = new Map(bundledItems.map((item) => [item.key, item]));
  const dishesByKey = new Map(bundledDishes.map((dish) => [dish.key, dish]));
  const addedItems = new Map();
  const addedDishes = new Map();
  const addItem = (key) => {
    if (!existingItems.has(key) && itemsByKey.has(key)) addedItems.set(key, itemsByKey.get(key));
  };
  for (const key of bundledPeople.flatMap((person) => (
    (person.food_rules || []).flatMap((rule) => rule.item_keys || [])
  ))) {
    const dish = dishesByKey.get(key);
    if (!dish) {
      addItem(key);
      continue;
    }
    if (!existingDishes.has(key)) addedDishes.set(key, dish);
    (dish.components || []).forEach((component) => addItem(component.item_key));
  }
  if (!addedItems.size && !addedDishes.size) return sources;
  return [...sources, {
    path: "food-rule-defaults-v12.json",
    content: `${JSON.stringify({
      items: [...addedItems.values()],
      dishes: [...addedDishes.values()],
    }, null, 2)}\n`,
  }];
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

export function mergeDuplicateIngredient(
  sources = [],
  fromKey = "fromage_rape",
  toKey = "emmental_rape",
  toName = "Emmental râpé",
) {
  const parsed = sources.map((source) => {
    try {
      return { source, value: JSON.parse(source.content) };
    } catch {
      return { source, value: null };
    }
  });
  const items = parsed.flatMap(({ value }) => Array.isArray(value?.items) ? value.items : []);
  const hasTarget = items.some((item) => item.key === toKey);
  const legacyRecords = items.filter((item) => item.key === fromKey);
  if (!legacyRecords.length) return sources;

  const legacyHistory = legacyRecords.flatMap((item) => item.price_history || []);
  const replaceReferences = (value) => {
    if (Array.isArray(value)) return value.map(replaceReferences);
    if (!value || typeof value !== "object") return value === fromKey ? toKey : value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        key === "items" ? entry : replaceReferences(entry),
      ]),
    );
  };
  const mergeHistory = (history = []) => {
    const seen = new Set();
    return [...legacyHistory, ...history].filter((entry) => {
      const identity = JSON.stringify([entry.date || "", entry.price, entry.description || ""]);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  };

  let promotedLegacy = false;
  return parsed.map(({ source, value }) => {
    if (!value) return source;
    const containsLegacy = Array.isArray(value.items)
      && value.items.some((item) => item.key === fromKey);
    const migrated = replaceReferences(value);
    if (Array.isArray(migrated.items)) {
      migrated.items = migrated.items.flatMap((item) => {
        if (item.key === fromKey) return [];
        if (item.key !== toKey) return [item];
        return [{ ...item, name: toName, price_history: mergeHistory(item.price_history) }];
      });
      if (!hasTarget && containsLegacy && !promotedLegacy) {
        const legacy = legacyRecords[0];
        migrated.items.push({
          ...legacy,
          key: toKey,
          name: toName,
          price_history: mergeHistory(legacy.price_history),
        });
        promotedLegacy = true;
      }
    }
    return { ...source, content: `${JSON.stringify(migrated, null, 2)}\n` };
  });
}

export function mergeBundledIngredientNutrition(sources = [], bundledItems = []) {
  const nutritionFields = [
    "sugars_g",
    "saturated_fat_g",
    "salt_g",
    "fruit_vegetable_legume_percent",
  ];
  const bundledByKey = new Map(bundledItems.map((item) => [item.key, item]));
  return sources.map((source) => {
    let value;
    try {
      value = JSON.parse(source.content);
    } catch {
      return source;
    }
    if (!Array.isArray(value.items)) return source;
    let changed = false;
    value.items = value.items.map((item) => {
      const bundled = bundledByKey.get(item.key);
      if (!bundled) return item;
      const additions = {};
      for (const field of nutritionFields) {
        if (item[field] == null && bundled[field] != null) {
          additions[field] = bundled[field];
        }
      }
      if (!Object.keys(additions).length) return item;
      changed = true;
      return { ...item, ...additions };
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
  const items = [];
  for (const path of manifest.files || []) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Cannot load ${path}`);
    const value = await response.json();
    if (Array.isArray(value.people)) people.push(...value.people);
    if (Array.isArray(value.dishes)) dishes.push(...value.dishes);
    if (Array.isArray(value.items)) items.push(...value.items);
  }
  return { people, dishes, items };
}
