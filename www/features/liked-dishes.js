export function canonicalMemberPreferenceKind(kind) {
  return kind === "like" ? "favorite" : kind;
}

export function likedDishesCopy(language) {
  const french = String(language || "").toLowerCase().startsWith("fr");
  return french
    ? {
        label: "Plats aimés",
        intro: "Ajoutez les routines et règles du générateur. Les plats aimés sont privilégiés pendant la génération automatique ; les aliments non aimés restent enregistrés comme préférence.",
      }
    : {
        label: "Liked dishes",
        intro: "Add generator routines and rules. Liked dishes are preferred during automatic generation; disliked foods remain stored as a preference.",
      };
}

function currentLanguage(documentRef) {
  return documentRef.documentElement.lang || globalThis.navigator?.language;
}

export function refineLikedDishesUi(documentRef = document) {
  const copy = likedDishesCopy(currentLanguage(documentRef));
  const intro = documentRef.querySelector('[data-i18n="optimizer_food_rules_intro"]');
  if (intro && intro.textContent !== copy.intro) intro.textContent = copy.intro;

  documentRef.querySelectorAll("[data-food-rule-kind]").forEach((select) => {
    const legacyLike = select.querySelector('option[value="like"]');
    const wasLegacyLike = select.value === "like";
    if (wasLegacyLike) select.value = "favorite";
    legacyLike?.remove();

    const favorite = select.querySelector('option[value="favorite"]');
    if (favorite && favorite.textContent !== copy.label) favorite.textContent = copy.label;

    if (wasLegacyLike) {
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

export function installLikedDishesUi(documentRef = document) {
  const refresh = () => refineLikedDishesUi(documentRef);
  const rules = documentRef.querySelector("#family-food-rules-list");
  if (rules && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => queueMicrotask(refresh))
      .observe(rules, { childList: true, subtree: true });
  }
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(() => queueMicrotask(refresh))
      .observe(documentRef.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }
  documentRef.querySelector("#language-select")?.addEventListener("change", () => queueMicrotask(refresh));
  refresh();
}

if (typeof document !== "undefined") {
  installLikedDishesUi(document);
}
