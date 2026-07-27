import init, { HomeALaCarteEngine } from "./pkg/homealacarte_web.js?v=homealacarte-27";

let engine;
let readyPromise;

async function ensureEngine() {
  if (!readyPromise) {
    const wasmUrl = new URL("./pkg/homealacarte_web_bg.wasm?v=homealacarte-27", self.location.href);
    readyPromise = init({ module_or_path: wasmUrl }).then(() => {
      engine = new HomeALaCarteEngine();
    });
  }
  await readyPromise;
}

function respond(requestId, type, payload = {}) {
  self.postMessage({ requestId, type, ...payload });
}

function currentState(snapshot) {
  return {
    snapshot,
    serializedData: engine.export_data("consolidated"),
  };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Cannot load ${url} (${response.status})`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await wait(200 * (attempt + 1));
    }
  }
  throw lastError;
}

async function loadBundled(manifestUrl) {
  const manifest = JSON.parse(await fetchText(manifestUrl));
  const files = [];
  // Python 2's SimpleHTTPServer is single-threaded. Loading sequentially keeps
  // its small connection queue from intermittently dropping mobile requests.
  for (const path of manifest.files) {
    files.push({
      path: path.replace(/^data\//, ""),
      content: await fetchText(path),
    });
  }
  return files;
}

self.onmessage = async ({ data }) => {
  const { requestId, type } = data;
  try {
    await ensureEngine();
    respond(requestId, "status", { code: "calculating" });
    let snapshot;
    if (type === "load-bundled") {
      snapshot = engine.load(await loadBundled(data.manifestUrl), { language: data.language });
      respond(requestId, "ready", { ...currentState(snapshot), source: "bundled" });
    } else if (type === "load-files") {
      snapshot = engine.load(data.files, { language: data.language });
      respond(requestId, "ready", { ...currentState(snapshot), source: data.source || "imported" });
    } else if (type === "replace-menu") {
      snapshot = engine.replace_menu(data.rows);
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "replace-people") {
      snapshot = engine.replace_people(data.rows);
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "replace-stock") {
      snapshot = engine.replace_stock(data.rows);
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "set-grocery-stock") {
      if (data.rows) engine.replace_menu(data.rows);
      if (data.stock) engine.replace_stock(data.stock);
      if (data.customGrocery) engine.replace_custom_grocery(data.customGrocery);
      snapshot = engine.set_grocery_stock(data.itemIds || [], Boolean(data.stocked));
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "replace-custom-grocery") {
      snapshot = engine.replace_custom_grocery(data.rows);
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "save-dish") {
      snapshot = engine.save_dish_with_custom_ingredients(
        data.dish,
        data.customIngredients || [],
        Boolean(data.replacing),
      );
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "replace-ingredient") {
      snapshot = engine.replace_ingredient(data.ingredient);
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "replace-household-item") {
      snapshot = engine.replace_household_item(data.item);
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "delete-item") {
      snapshot = engine.delete_item(data.key);
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "set-language") {
      snapshot = engine.set_language(data.language);
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "set-profile") {
      snapshot = engine.set_profile(data.profile || undefined);
      respond(requestId, "result", currentState(snapshot));
    } else if (type === "snapshot") {
      respond(requestId, "result", currentState(engine.snapshot()));
    } else if (type === "export-data") {
      if (data.rows) engine.replace_menu(data.rows);
      if (data.stock) engine.replace_stock(data.stock);
      if (data.customGrocery) engine.replace_custom_grocery(data.customGrocery);
      const content = engine.export_data(data.kind);
      respond(requestId, "export-ready", {
        content,
        ...currentState(engine.snapshot()),
        filename: data.kind === "menu" ? "menu.json" : "homealacarte_data.json",
      });
    } else if (type === "export-folder") {
      if (data.rows) engine.replace_menu(data.rows);
      if (data.stock) engine.replace_stock(data.stock);
      if (data.customGrocery) engine.replace_custom_grocery(data.customGrocery);
      respond(requestId, "folder-export-ready", {
        files: engine.export_folder(),
        ...currentState(engine.snapshot()),
      });
    } else if (type === "generate-pdf") {
      if (data.rows) engine.replace_menu(data.rows);
      if (data.stock) engine.replace_stock(data.stock);
      if (data.customGrocery) engine.replace_custom_grocery(data.customGrocery);
      snapshot = engine.snapshot();
      const bytes = engine.generate_grocery_pdf_excluding(
        data.language,
        data.excludedIds || [],
      );
      self.postMessage(
        {
          requestId,
          type: "pdf-ready",
          bytes,
          ...currentState(snapshot),
          filename: "liste_de_courses.pdf",
        },
        [bytes.buffer],
      );
    } else {
      throw new Error(`Unknown worker command: ${type}`);
    }
  } catch (error) {
    const message = error?.message || String(error);
    respond(requestId, "error", {
      message,
      code: /failed to fetch|load failed|networkerror|network request failed/i.test(message)
        ? "network_error"
        : "",
    });
  }
};
