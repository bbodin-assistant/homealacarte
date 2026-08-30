function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addScaledNutrients(target, source, multiplier) {
  for (const key of ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"]) {
    target[key] = (target[key] || 0) + Number(source?.[key] || 0) * multiplier;
  }
}

export function menuDateWindow(days, dayOffset = 0, today = new Date()) {
  if (!Array.isArray(days) || days.length !== 7) return [];
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() + Number(dayOffset || 0));
  const mondayIndex = (start.getDay() + 6) % 7;
  return days.map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      day: days[(mondayIndex + index) % 7],
      date: localIsoDate(date),
    };
  });
}

export function menuWeek(days, weekOffset = 0, today = new Date()) {
  return menuDateWindow(days, Number(weekOffset || 0) * 7, today);
}

export function menuDateForDay(week, day) {
  return week.find((entry) => entry.day === day)?.date || "";
}

export function menuRowsForWeek(rows, week) {
  const dates = new Set(week.map((entry) => entry.date));
  return (rows || []).filter((row) => dates.has(String(row.date || "")));
}

export function dateMenuRowsForWeek(rows, week) {
  return (rows || []).map((row) => ({
    ...row,
    date: menuDateForDay(week, row.day),
  }));
}

export function migrateUndatedMenuRows(rows, days, today = new Date()) {
  const week = menuWeek(days, 0, today);
  let changed = false;
  const migrated = (rows || []).map((row) => {
    if (String(row.date || "").trim()) return row;
    const date = menuDateForDay(week, row.day);
    if (!date) return row;
    changed = true;
    return { ...row, date };
  });
  return { rows: migrated, changed };
}

export function menuNutritionByDate(snapshot, rows) {
  const nutrition = new Map();
  const ingredients = new Map((snapshot.ingredients || []).map((item) => [item.key, item]));
  const dishes = new Map((snapshot.dishes || []).map((item) => [item.key, item]));
  for (const row of rows || []) {
    if (snapshot.profile && !row.people.includes(snapshot.profile)) continue;
    const target = nutrition.get(row.date) || {};
    const ingredient = ingredients.get(row.item_key);
    const dish = dishes.get(row.item_key);
    let multiplier = Number(row.quantity || 0);
    let nutrients = null;
    if (ingredient) {
      nutrients = ingredient;
      if (row.quantity_unit === "g") multiplier /= Number(ingredient.grams || 1);
      else if (row.quantity_unit === "unit") {
        multiplier *= Number(ingredient.grams_per_measure_unit || 1) / Number(ingredient.grams || 1);
      }
    } else if (dish) {
      nutrients = dish.per_serving;
      if (row.quantity_unit === "g") multiplier /= Number(dish.per_serving?.grams || 1);
    }
    if (!nutrients) continue;
    addScaledNutrients(target, nutrients, multiplier);
    nutrition.set(row.date, target);
  }
  return nutrition;
}
