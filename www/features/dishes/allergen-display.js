import {
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
