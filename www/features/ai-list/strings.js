const STRINGS = {
  en: {
    add: "Add with AI",
    stockTitle: "Add stock with AI",
    needsTitle: "Add extra needs with AI",
    stockIntro: "Paste a list of items and quantities. Matching catalogue items will be added to stock; missing items will be created as custom catalogue items first.",
    needsIntro: "Paste a list of items and quantities. Matching catalogue items will be reused; anything unmatched will be added as a custom extra need.",
    list: "Item list",
    listPlaceholder: "Examples:\n2 kg basmati rice\n6 eggs\n3 bottles hand soap\n12 rolls toilet paper",
    server: "LLM server (Ollama/OpenAI-compatible)",
    model: "Model",
    refresh: "Refresh models",
    privacyLocal: "The list is sent directly from this browser to your local LLM server.",
    privacyRemote: "This server is not local. The pasted list will be sent to that server.",
    corsHint: "If this site cannot reach the LLM server, configure its CORS policy.",
    cancel: "Cancel",
    close: "Close",
    stop: "Stop",
    stockSubmit: "Add stock",
    needsSubmit: "Add extra needs",
    loadingModels: "Looking for available LLM models…",
    extracting: "Reading item list… {seconds}s",
    matching: "Matching item {index}/{total}: {item}",
    matchHeading: "Catalogue matching:",
    matched: "✓ {item} → {match}",
    custom: "• {item} → custom item",
    finalHeading: "Final structured result:",
    stockAdded: "✓ Stock update submitted ({count} items).",
    needsAdded: "✓ Extra-needs update submitted ({count} items).",
    noModels: "No models were found on this LLM server.",
    stopped: "Generation stopped.",
    invalidUrl: "Check the LLM server address.",
    network: "Cannot reach the LLM server. Check that it is running and allows requests from this site.",
    timeout: "The LLM took too long to respond. Try a faster/smaller model or a shorter list.",
    badResponse: "The model returned data that could not be safely added. Try again or choose another model.",
    dataNotReady: "The item database is still loading.",
    tooLong: "The pasted text is too long. Maximum: {max} characters.",
    empty: "Paste an item list first.",
    modelRequired: "Select an LLM model.",
    unknownItem: "The model referenced an item key that is not in the supplied catalogue: {key}.",
    unsupportedQuantity: "The quantity for “{name}” cannot be represented safely.",
  },
  fr: {
    add: "Ajouter avec l’IA",
    stockTitle: "Ajouter du stock avec l’IA",
    needsTitle: "Ajouter des besoins avec l’IA",
    stockIntro: "Collez une liste d’articles avec leurs quantités. Les articles du catalogue seront réutilisés ; les articles absents seront d’abord créés comme articles personnalisés.",
    needsIntro: "Collez une liste d’articles avec leurs quantités. Les articles du catalogue seront réutilisés ; les autres seront ajoutés comme besoins personnalisés.",
    list: "Liste d’articles",
    listPlaceholder: "Exemples :\n2 kg de riz basmati\n6 œufs\n3 bouteilles de savon\n12 rouleaux de papier toilette",
    server: "Serveur LLM (Ollama/OpenAI-compatible)",
    model: "Modèle",
    refresh: "Actualiser les modèles",
    privacyLocal: "La liste est envoyée directement depuis ce navigateur vers votre serveur LLM local.",
    privacyRemote: "Ce serveur n’est pas local. La liste collée lui sera envoyée.",
    corsHint: "Si le site ne peut pas joindre le serveur LLM, configurez sa politique CORS.",
    cancel: "Annuler",
    close: "Fermer",
    stop: "Arrêter",
    stockSubmit: "Ajouter au stock",
    needsSubmit: "Ajouter aux besoins",
    loadingModels: "Recherche des modèles LLM disponibles…",
    extracting: "Lecture de la liste… {seconds}s",
    matching: "Correspondance {index}/{total} : {item}",
    matchHeading: "Correspondance avec le catalogue :",
    matched: "✓ {item} → {match}",
    custom: "• {item} → article personnalisé",
    finalHeading: "Résultat structuré final :",
    stockAdded: "✓ Mise à jour du stock envoyée ({count} articles).",
    needsAdded: "✓ Mise à jour des besoins envoyée ({count} articles).",
    noModels: "Aucun modèle n’a été trouvé sur ce serveur LLM.",
    stopped: "Génération arrêtée.",
    invalidUrl: "Vérifiez l’adresse du serveur LLM.",
    network: "Impossible de joindre le serveur LLM. Vérifiez qu’il fonctionne et autorise les requêtes depuis ce site.",
    timeout: "Le LLM a mis trop de temps à répondre. Essayez un modèle plus rapide ou une liste plus courte.",
    badResponse: "Le modèle a renvoyé des données qui ne peuvent pas être ajoutées en toute sécurité.",
    dataNotReady: "La base d’articles est encore en cours de chargement.",
    tooLong: "Le texte collé est trop long. Maximum : {max} caractères.",
    empty: "Collez d’abord une liste d’articles.",
    modelRequired: "Sélectionnez un modèle LLM.",
    unknownItem: "Le modèle a référencé une clé absente du catalogue fourni : {key}.",
    unsupportedQuantity: "La quantité de « {name} » ne peut pas être représentée en toute sécurité.",
  },
};

function localeTable(language) {
  const entries = Object.entries(STRINGS);
  const requested = String(language || "").trim().toLowerCase();
  const primary = requested.split("-")[0];
  return entries.find(([locale]) => locale.toLowerCase() === requested)?.[1]
    || entries.find(([locale]) => locale.toLowerCase().split("-")[0] === primary)?.[1]
    || entries[0]?.[1]
    || {};
}

function localizedString(language, key) {
  const selected = localeTable(language);
  return selected[key]
    || Object.values(STRINGS).map((table) => table[key]).find(Boolean)
    || key;
}

function template(value, values = {}) {
  return Object.entries(values).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, String(replacement)),
    value,
  );
}

export function aiListText(language, key, values = {}) {
  return template(localizedString(language, key), values);
}
