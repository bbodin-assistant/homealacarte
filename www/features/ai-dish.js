import {
  DEFAULT_OLLAMA_URL,
  MAX_RECIPE_TEXT_CHARS,
  OllamaError,
  generateRecipeWithOllama,
  isLoopbackOllamaUrl,
  listOllamaModels,
  normalizeOllamaUrl,
} from "./ai-dish/ollama.js?v=homealacarte-80";

const SERVER_STORAGE_KEY = "homealacarte-ollama-url";
const MODEL_STORAGE_KEY = "homealacarte-ollama-model";

const STRINGS = {
  en: {
    add: "Add with AI",
    title: "Add a dish with AI",
    intro: "Paste a recipe, ingredient list, or cooking notes. An LLM will structure one dish and add it to your database.",
    recipe: "Recipe text",
    recipePlaceholder: "Paste the recipe here…",
    server: "LLM server (Ollama/OpenAI-compatible)",
    model: "Model",
    refresh: "Refresh models",
    privacyLocal: "The recipe is sent directly from this browser to your local LLM server.",
    privacyRemote: "This server is not local. The pasted recipe text will be sent to that server.",
    corsHint: "If this site cannot reach the LLM server, configure its CORS policy. For Ollama, allow this page origin with OLLAMA_ORIGINS and restart Ollama.",
    cancel: "Cancel",
    stop: "Stop",
    submit: "Generate and add dish",
    loadingModels: "Looking for available LLM models…",
    extracting: "Reading and structuring recipe… {seconds}s",
    matching: "Matching ingredient {index}/{total}: {ingredient}",
    matchHeading: "Ingredient matching:",
    matched: "✓ {ingredient} → {match}",
    custom: "• {ingredient} → custom ingredient",
    noModels: "No models were found on this LLM server.",
    stopped: "Generation stopped.",
    invalidUrl: "Check the LLM server address.",
    network: "Cannot reach the LLM server. Check that it is running and allows requests from this site.",
    timeout: "The LLM took too long to respond. Try a faster/smaller model or a shorter recipe.",
    badResponse: "The model returned data that could not be safely added. Try again or choose another model.",
    unknownIngredient: "The model referenced an ingredient key that is not in the supplied catalogue: {key}.",
    unsupportedUnit: "{name} uses unsupported unit “{unit}”. Existing ingredients must use grams or their configured unit; new ingredients must use grams.",
    dataNotReady: "The food database is still loading.",
    tooLong: "The pasted text is too long. Maximum: {max} characters.",
    empty: "Paste some recipe text first.",
    modelRequired: "Select an LLM model.",
  },
  fr: {
    add: "Ajouter avec l’IA",
    title: "Ajouter un plat avec l’IA",
    intro: "Collez une recette, une liste d’ingrédients ou des notes. Un LLM structurera un plat et l’ajoutera à votre base.",
    recipe: "Texte de la recette",
    recipePlaceholder: "Collez la recette ici…",
    server: "Serveur LLM (Ollama/compatible OpenAI)",
    model: "Modèle",
    refresh: "Actualiser les modèles",
    privacyLocal: "La recette est envoyée directement par ce navigateur à votre serveur LLM local.",
    privacyRemote: "Ce serveur n’est pas local. Le texte collé sera envoyé à ce serveur.",
    corsHint: "Si ce site ne peut pas joindre le serveur LLM, configurez sa politique CORS. Pour Ollama, autorisez l’origine de cette page avec OLLAMA_ORIGINS puis redémarrez Ollama.",
    cancel: "Annuler",
    stop: "Arrêter",
    submit: "Générer et ajouter le plat",
    loadingModels: "Recherche des modèles LLM disponibles…",
    extracting: "Lecture et structuration de la recette… {seconds}s",
    matching: "Correspondance de l’ingrédient {index}/{total} : {ingredient}",
    matchHeading: "Correspondance des ingrédients :",
    matched: "✓ {ingredient} → {match}",
    custom: "• {ingredient} → ingrédient personnalisé",
    noModels: "Aucun modèle n’a été trouvé sur ce serveur LLM.",
    stopped: "Génération arrêtée.",
    invalidUrl: "Vérifiez l’adresse du serveur LLM.",
    network: "Impossible de joindre le serveur LLM. Vérifiez qu’il fonctionne et qu’il autorise les requêtes depuis ce site.",
    timeout: "Le LLM a mis trop de temps à répondre. Essayez un modèle plus rapide/petit ou une recette plus courte.",
    badResponse: "Le modèle a renvoyé des données qui ne peuvent pas être ajoutées en sécurité. Réessayez ou choisissez un autre modèle.",
    unknownIngredient: "Le modèle a référencé une clé d’ingrédient absente du catalogue fourni : {key}.",
    unsupportedUnit: "{name} utilise l’unité « {unit} ». Un ingrédient existant doit utiliser les grammes ou son unité configurée ; un nouvel ingrédient doit utiliser les grammes.",
    dataNotReady: "La base alimentaire est encore en cours de chargement.",
    tooLong: "Le texte collé est trop long. Maximum : {max} caractères.",
    empty: "Collez d’abord le texte d’une recette.",
    modelRequired: "Sélectionnez un modèle LLM.",
  },
};

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value, fallback) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;
}

export function uniqueAiKey(prefix, name, existingKeys, reserved = new Set()) {
  const base = `${prefix}_${slug(name, prefix === "dish" ? "recipe" : "custom")}`;
  const occupied = new Set([...(existingKeys || []), ...reserved]);
  let key = base;
  let suffix = 2;
  while (occupied.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

function unitMatches(left, right) {
  const normalize = (value) => String(value || "").trim().toLowerCase().replace(/s$/, "");
  return normalize(left) === normalize(right);
}

function safeRecipeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function text(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function ingredientLookup(snapshot) {
  return new Map(
    (snapshot?.item_options || [])
      .filter((item) => item.kind === "ingredient")
      .map((item) => [item.key, item]),
  );
}

function exactNameLookup(snapshot) {
  const lookup = new Map();
  (snapshot?.item_options || [])
    .filter((item) => item.kind === "ingredient")
    .forEach((item) => {
      const name = normalizeName(item.name);
      if (!lookup.has(name)) lookup.set(name, []);
      lookup.get(name).push(item);
    });
  return lookup;
}

export function buildDishSavePayload(recipe, snapshot) {
  if (!snapshot) throw new Error("ai_data_not_ready");
  const existingKeys = new Set((snapshot.item_options || []).map((item) => item.key));
  const byKey = ingredientLookup(snapshot);
  const byName = exactNameLookup(snapshot);
  const reserved = new Set();
  const newByName = new Map();
  const customIngredients = [];
  const components = [];

  for (const generated of recipe.ingredients || []) {
    const name = text(generated.name, 160);
    const requestedKey = text(generated.existing_key, 160);
    const quantity = Number(generated.quantity);
    const unit = text(generated.unit, 40);
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || !unit) {
      throw new Error("ai_invalid_recipe");
    }
    let existing = requestedKey ? byKey.get(requestedKey) : null;
    if (requestedKey && !existing) {
      const error = new Error("ai_unknown_ingredient");
      error.detail = requestedKey;
      throw error;
    }
    if (!existing) {
      const exactMatches = byName.get(normalizeName(name)) || [];
      if (exactMatches.length === 1) existing = exactMatches[0];
    }

    let itemKey;
    let quantityUnit;
    if (existing) {
      if (!unitMatches(unit, "g") && !unitMatches(unit, existing.measure_unit)) {
        const error = new Error("ai_unsupported_unit");
        error.ingredient = existing.name;
        error.unit = unit;
        throw error;
      }
      itemKey = existing.key;
      quantityUnit = unitMatches(unit, "g") ? "g" : existing.measure_unit;
    } else {
      if (!unitMatches(unit, "g")) {
        const error = new Error("ai_unsupported_unit");
        error.ingredient = name;
        error.unit = unit;
        throw error;
      }
      const normalized = normalizeName(name);
      itemKey = newByName.get(normalized);
      if (!itemKey) {
        itemKey = uniqueAiKey("item", name, existingKeys, reserved);
        reserved.add(itemKey);
        newByName.set(normalized, itemKey);
        customIngredients.push({
          key: itemKey,
          name,
          custom: true,
          incomplete: true,
          grams: 100,
          kcal: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
          sugars_g: null,
          saturated_fat_g: null,
          salt_g: null,
          fruit_vegetable_legume_percent: null,
          category: "",
          source: "AI recipe import; nutritional values require review",
          url: "",
          price_per_kg: 0,
          price_source: "",
          price_checked_at: "",
          price_history: [],
          measure_unit: "g",
          grams_per_measure_unit: 1,
          purchase_unit: "100 g",
          purchase_quantity_grams: 100,
        });
      }
      quantityUnit = "g";
    }
    const sourceQuantity = text(generated.source_quantity, 200)
      || `${quantity} ${quantityUnit}`;
    const mergeKey = `${itemKey}\u0000${quantityUnit}`;
    const previous = components.find((component) => component._mergeKey === mergeKey);
    if (previous) {
      previous.quantity += quantity;
      if (sourceQuantity && !previous.source_quantity.includes(sourceQuantity)) {
        previous.source_quantity = `${previous.source_quantity}; ${sourceQuantity}`.slice(0, 400);
      }
    } else {
      components.push({
        _mergeKey: mergeKey,
        item_key: itemKey,
        quantity,
        quantity_unit: quantityUnit,
        source_quantity: sourceQuantity,
      });
    }
  }
  if (!components.length) throw new Error("ai_invalid_recipe");
  const name = text(recipe.name, 160);
  const servings = Number(recipe.servings);
  if (!name || !Number.isFinite(servings) || servings <= 0 || servings > 100) {
    throw new Error("ai_invalid_recipe");
  }
  const dishKey = uniqueAiKey("dish", name, existingKeys, reserved);
  return {
    dish: {
      key: dishKey,
      name,
      servings,
      recipe_url: safeRecipeUrl(recipe.recipe_url),
      source: text(recipe.source, 240) || "LLM recipe import",
      nutri_score: "",
      auto_menu_main: recipe.auto_menu_main !== false,
      source_notes: (recipe.source_notes || []).map((note) => text(note, 800)).filter(Boolean).slice(0, 20),
      components: components.map(({ _mergeKey, ...component }) => component),
    },
    customIngredients,
    replacing: false,
  };
}

function template(value, values = {}) {
  return Object.entries(values).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, String(replacement)),
    value,
  );
}

export function createAiDishFeature({ state, select, documentRef, storage, locationRef, send }) {
  const language = () => (state.language === "en" ? "en" : "fr");
  const t = (key, values) => template(STRINGS[language()][key] || STRINGS.en[key] || key, values);
  let controller = null;
  let timer = null;
  let startedAt = 0;
  let progressState = { phase: "extracting" };
  let matchingHeadingShown = false;

  function installStyles() {
    if (documentRef.querySelector("#ai-dish-styles")) return;
    const style = documentRef.createElement("style");
    style.id = "ai-dish-styles";
    style.textContent = `
      .dish-heading-actions{align-items:center;flex-wrap:wrap}.ai-dish-button svg{fill:none;stroke:currentColor;stroke-width:1.8}
      .ai-dish-dialog{width:min(720px,calc(100vw - 28px))}.ai-dish-form{display:grid;gap:0}.ai-dish-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px 24px}
      .ai-dish-wide{grid-column:1/-1}.ai-dish-fields textarea{min-height:210px;resize:vertical}.ai-dish-model-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
      .ai-dish-hint{margin:0;color:var(--muted);font-size:12px;line-height:1.5}.ai-dish-warning{color:#8a5a18}.ai-dish-error{margin:0;color:#9b302a;white-space:pre-wrap}
      .ai-dish-progress{display:flex;align-items:center;gap:9px;margin:0;color:var(--muted);font-size:12px;font-weight:700}.ai-dish-progress .spinner{position:static;width:15px;height:15px;clip:auto;clip-path:none;margin:0;overflow:visible}
      .ai-dish-output{box-sizing:border-box;width:100%;height:7.5em;min-height:0!important;resize:none;overflow:auto;font:inherit;font-size:12px;line-height:1.5;color:var(--muted);background:var(--surface);white-space:pre-wrap}
      .ai-dish-actions .button[hidden],.ai-dish-progress[hidden],.ai-dish-output[hidden],.ai-dish-error:empty{display:none}.ai-dish-actions{display:flex;justify-content:flex-end;gap:9px}
      @media(max-width:620px){.ai-dish-fields{grid-template-columns:1fr;padding:18px}.ai-dish-wide{grid-column:auto}.dish-heading-actions{width:100%}.dish-heading-actions .button{flex:1}}
    `;
    documentRef.head.append(style);
  }

  function installButton() {
    if (select("#add-dish-ai")) return;
    const addDish = select("#add-dish");
    if (!addDish) return;
    const actions = documentRef.createElement("div");
    actions.className = "page-actions dish-heading-actions";
    addDish.before(actions);
    actions.append(addDish);
    const button = documentRef.createElement("button");
    button.id = "add-dish-ai";
    button.className = "button ghost ai-dish-button";
    button.type = "button";
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg><span></span>`;
    actions.append(button);
  }

  function installDialog() {
    if (select("#ai-dish-dialog")) return;
    documentRef.body.insertAdjacentHTML("beforeend", `
      <dialog id="ai-dish-dialog" class="menu-item-dialog ai-dish-dialog" aria-labelledby="ai-dish-title">
        <form id="ai-dish-form" class="ai-dish-form">
          <div class="menu-dialog-heading"><div><p class="eyebrow">AI · LLM</p><h2 id="ai-dish-title"></h2><p id="ai-dish-intro"></p></div>
            <button id="ai-dish-close" class="dialog-close" type="button" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
          <div class="ai-dish-fields">
            <label class="dialog-field ai-dish-wide"><span id="ai-dish-recipe-label"></span><textarea id="ai-dish-recipe" maxlength="${MAX_RECIPE_TEXT_CHARS}" required></textarea></label>
            <label class="dialog-field"><span id="ai-dish-server-label"></span><input id="ai-dish-server" type="text" inputmode="url" autocomplete="off"></label>
            <label class="dialog-field"><span id="ai-dish-model-label"></span><div class="ai-dish-model-row"><select id="ai-dish-model" required></select><button id="ai-dish-refresh" class="button ghost compact" type="button"></button></div></label>
            <p id="ai-dish-privacy" class="ai-dish-hint ai-dish-wide"></p><p id="ai-dish-cors" class="ai-dish-hint ai-dish-wide"></p>
            <p id="ai-dish-progress" class="ai-dish-progress ai-dish-wide" hidden><span class="spinner"></span><span></span></p>
            <textarea id="ai-dish-output" class="ai-dish-output ai-dish-wide" rows="5" readonly hidden aria-label="Live model output"></textarea>
            <p id="ai-dish-error" class="ai-dish-error ai-dish-wide" role="alert"></p>
          </div>
          <div class="menu-dialog-actions ai-dish-actions"><button id="ai-dish-cancel" class="button ghost" type="button"></button><button id="ai-dish-stop" class="button ghost" type="button" hidden></button><button id="ai-dish-submit" class="button primary" type="submit"></button></div>
        </form>
      </dialog>`);
  }

  function renderLanguage() {
    const button = select("#add-dish-ai span");
    if (button) button.textContent = `+ ${t("add")}`;
    if (!select("#ai-dish-dialog")) return;
    select("#ai-dish-title").textContent = t("title");
    select("#ai-dish-intro").textContent = t("intro");
    select("#ai-dish-recipe-label").textContent = t("recipe");
    select("#ai-dish-recipe").placeholder = t("recipePlaceholder");
    select("#ai-dish-server-label").textContent = t("server");
    select("#ai-dish-model-label").textContent = t("model");
    select("#ai-dish-refresh").textContent = t("refresh");
    select("#ai-dish-cancel").textContent = t("cancel");
    select("#ai-dish-stop").textContent = t("stop");
    select("#ai-dish-submit").textContent = t("submit");
    renderPrivacy();
    renderProgress();
  }

  function renderPrivacy() {
    const server = select("#ai-dish-server")?.value || DEFAULT_OLLAMA_URL;
    try {
      select("#ai-dish-privacy").textContent = isLoopbackOllamaUrl(server) ? t("privacyLocal") : t("privacyRemote");
      select("#ai-dish-privacy").classList.toggle("ai-dish-warning", !isLoopbackOllamaUrl(server));
    } catch {
      select("#ai-dish-privacy").textContent = t("invalidUrl");
      select("#ai-dish-privacy").classList.add("ai-dish-warning");
    }
    select("#ai-dish-cors").textContent = `${t("corsHint")} (${locationRef.origin})`;
  }

  function setError(message = "") {
    select("#ai-dish-error").textContent = message;
  }

  function appendModelOutput(chunk) {
    const output = select("#ai-dish-output");
    if (!output || !chunk) return;
    output.value += chunk;
    output.scrollTop = output.scrollHeight;
  }

  function appendStatusLine(message) {
    const output = select("#ai-dish-output");
    if (!output || !message) return;
    if (output.value && !output.value.endsWith("\n")) output.value += "\n";
    output.value += `${message}\n`;
    output.scrollTop = output.scrollHeight;
  }

  function renderProgress() {
    const label = select("#ai-dish-progress span:last-child");
    if (!label) return;
    if (progressState.phase === "matching" || progressState.phase === "matched") {
      label.textContent = t("matching", progressState);
      return;
    }
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    label.textContent = t("extracting", { seconds });
  }

  function handleProgress(progress) {
    progressState = progress || { phase: "extracting" };
    if (progressState.phase === "matching" && !matchingHeadingShown) {
      appendStatusLine("");
      appendStatusLine(t("matchHeading"));
      matchingHeadingShown = true;
    }
    if (progressState.phase === "matched") {
      appendStatusLine(progressState.existingName
        ? t("matched", { ingredient: progressState.ingredient, match: progressState.existingName })
        : t("custom", { ingredient: progressState.ingredient }));
    }
    renderProgress();
  }

  function setGenerating(generating) {
    ["#ai-dish-recipe", "#ai-dish-server", "#ai-dish-model", "#ai-dish-refresh", "#ai-dish-submit", "#ai-dish-cancel"]
      .forEach((selector) => { select(selector).disabled = generating; });
    select("#ai-dish-stop").hidden = !generating;
    select("#ai-dish-progress").hidden = !generating;
    if (!generating) {
      clearInterval(timer);
      timer = null;
      return;
    }
    const output = select("#ai-dish-output");
    if (output) {
      output.value = "";
      output.hidden = false;
    }
    startedAt = Date.now();
    progressState = { phase: "extracting" };
    matchingHeadingShown = false;
    renderProgress();
    timer = setInterval(renderProgress, 1000);
  }

  function explainError(error) {
    if (error?.message === "ai_data_not_ready") return t("dataNotReady");
    if (error?.message === "ai_unknown_ingredient") return t("unknownIngredient", { key: error.detail || "?" });
    if (error?.message === "ai_unsupported_unit") return t("unsupportedUnit", { name: error.ingredient || "?", unit: error.unit || "?" });
    if (error?.name === "AbortError") return t("stopped");
    if (error instanceof OllamaError) {
      if (error.code === "invalid_url") return t("invalidUrl");
      if (error.code === "network_error") return t("network");
      if (error.code === "timeout") return t("timeout");
      if (["invalid_response", "invalid_recipe"].includes(error.code)) return t("badResponse");
      return [error.message, error.details].filter(Boolean).join("\n");
    }
    return error?.message || t("badResponse");
  }

  async function refreshModels() {
    setError("");
    const serverInput = select("#ai-dish-server");
    const modelSelect = select("#ai-dish-model");
    const refresh = select("#ai-dish-refresh");
    const submit = select("#ai-dish-submit");
    modelSelect.disabled = true;
    refresh.disabled = true;
    submit.disabled = true;
    modelSelect.innerHTML = `<option value="">${t("loadingModels")}</option>`;
    try {
      const normalized = normalizeOllamaUrl(serverInput.value);
      serverInput.value = normalized;
      storage.setItem(SERVER_STORAGE_KEY, normalized);
      renderPrivacy();
      const models = await listOllamaModels(normalized);
      if (!models.length) {
        modelSelect.innerHTML = "<option value=\"\"></option>";
        setError(t("noModels"));
        return;
      }
      const preferred = storage.getItem(MODEL_STORAGE_KEY) || "";
      modelSelect.innerHTML = models.map((model) => `<option></option>`).join("");
      [...modelSelect.options].forEach((option, index) => {
        option.value = models[index];
        option.textContent = models[index];
      });
      modelSelect.value = models.includes(preferred) ? preferred : models[0];
    } catch (error) {
      modelSelect.innerHTML = "<option value=\"\"></option>";
      setError(explainError(error));
    } finally {
      modelSelect.disabled = false;
      refresh.disabled = false;
      submit.disabled = false;
    }
  }

  async function open() {
    if (!state.snapshot) {
      setError(t("dataNotReady"));
      return;
    }
    setError("");
    const output = select("#ai-dish-output");
    if (output) {
      output.value = "";
      output.hidden = true;
    }
    select("#ai-dish-server").value = storage.getItem(SERVER_STORAGE_KEY) || DEFAULT_OLLAMA_URL;
    renderLanguage();
    const dialog = select("#ai-dish-dialog");
    if (!dialog.open) dialog.showModal();
    select("#ai-dish-recipe").focus();
    await refreshModels();
  }

  function close() {
    if (controller) controller.abort();
    controller = null;
    setGenerating(false);
    const dialog = select("#ai-dish-dialog");
    if (dialog?.open) dialog.close();
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const recipeText = select("#ai-dish-recipe").value.trim();
    const model = select("#ai-dish-model").value.trim();
    if (!recipeText) return setError(t("empty"));
    if (recipeText.length > MAX_RECIPE_TEXT_CHARS) return setError(t("tooLong", { max: MAX_RECIPE_TEXT_CHARS }));
    if (!model) return setError(t("modelRequired"));
    if (!state.snapshot) return setError(t("dataNotReady"));
    controller = new AbortController();
    setGenerating(true);
    try {
      const baseUrl = normalizeOllamaUrl(select("#ai-dish-server").value);
      storage.setItem(SERVER_STORAGE_KEY, baseUrl);
      storage.setItem(MODEL_STORAGE_KEY, model);
      const result = await generateRecipeWithOllama({
        baseUrl,
        model,
        recipeText,
        ingredientOptions: state.snapshot.item_options,
        signal: controller.signal,
        onChunk: appendModelOutput,
        onProgress: handleProgress,
      });
      const payload = buildDishSavePayload(result.recipe, state.snapshot);
      send("save-dish", payload);
      controller = null;
      setGenerating(false);
      select("#ai-dish-dialog").close();
      select("#ai-dish-recipe").value = "";
    } catch (error) {
      const aborted = controller?.signal.aborted || error?.name === "AbortError";
      controller = null;
      setGenerating(false);
      if (!aborted) setError(explainError(error));
      else setError(t("stopped"));
    }
  }

  function mount() {
    installStyles();
    installButton();
    installDialog();
    renderLanguage();
    select("#add-dish-ai").addEventListener("click", open);
    select("#ai-dish-close").addEventListener("click", close);
    select("#ai-dish-cancel").addEventListener("click", close);
    select("#ai-dish-stop").addEventListener("click", () => controller?.abort());
    select("#ai-dish-refresh").addEventListener("click", refreshModels);
    select("#ai-dish-server").addEventListener("input", renderPrivacy);
    select("#ai-dish-form").addEventListener("submit", submit);
    select("#language-select")?.addEventListener("change", renderLanguage);
    select("#ai-dish-dialog").addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
  }

  return { close, mount, open, refreshModels };
}
