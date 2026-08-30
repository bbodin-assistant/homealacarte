import {
  DEFAULT_OLLAMA_URL,
  MAX_RECIPE_TEXT_CHARS,
  OllamaError,
  isLoopbackOllamaUrl,
  listOllamaModels,
  normalizeOllamaUrl,
} from "./ai-dish/ollama.js?v=homealacarte-82";
import { generateItemListWithOllama } from "./ai-list/ollama.js?v=homealacarte-82";
import {
  buildAiExtraNeedsRows,
  buildAiStockPayload,
  itemOptionsForAi,
} from "./ai-list/payload.js?v=homealacarte-110";
import { installAiListUi } from "./ai-list/dialog.js?v=homealacarte-82";
import { aiListText } from "./ai-list/strings.js?v=homealacarte-82";

const SERVER_STORAGE_KEY = "homealacarte-ollama-url";
const MODEL_STORAGE_KEY = "homealacarte-ollama-model";

export function createAiListFeature({
  state,
  select,
  documentRef,
  storage,
  locationRef,
  send,
}) {
  const t = (key, values) => aiListText(state.language, key, values);
  let mode = "stock";
  let controller = null;
  let timer = null;
  let startedAt = 0;
  let progressState = { phase: "extracting" };
  let matchingHeadingShown = false;



  function renderLanguage() {
    ["#add-stock-ai", "#add-needs-ai"].forEach((selector) => {
      const button = select(selector);
      if (button) button.textContent = `+ ${t("add")}`;
    });
    if (!select("#ai-list-dialog")) return;
    select("#ai-list-title").textContent = t(mode === "stock" ? "stockTitle" : "needsTitle");
    select("#ai-list-intro").textContent = t(mode === "stock" ? "stockIntro" : "needsIntro");
    select("#ai-list-text-label").textContent = t("list");
    select("#ai-list-text").placeholder = t("listPlaceholder");
    select("#ai-list-server-label").textContent = t("server");
    select("#ai-list-model-label").textContent = t("model");
    select("#ai-list-refresh").textContent = t("refresh");
    select("#ai-list-cancel").textContent = t("cancel");
    select("#ai-list-stop").textContent = t("stop");
    select("#ai-list-submit").textContent = t(mode === "stock" ? "stockSubmit" : "needsSubmit");
    renderPrivacy();
    renderProgress();
  }

  function renderPrivacy() {
    const server = select("#ai-list-server")?.value || DEFAULT_OLLAMA_URL;
    try {
      const local = isLoopbackOllamaUrl(server);
      select("#ai-list-privacy").textContent = t(local ? "privacyLocal" : "privacyRemote");
      select("#ai-list-privacy").classList.toggle("ai-list-warning", !local);
    } catch {
      select("#ai-list-privacy").textContent = t("invalidUrl");
      select("#ai-list-privacy").classList.add("ai-list-warning");
    }
    select("#ai-list-cors").textContent = `${t("corsHint")} (${locationRef.origin})`;
  }

  function setError(message = "") {
    select("#ai-list-error").textContent = message;
  }

  function appendOutput(value) {
    const output = select("#ai-list-output");
    if (!output || !value) return;
    output.value += value;
    output.scrollTop = output.scrollHeight;
  }

  function appendLine(value) {
    const output = select("#ai-list-output");
    if (!output || !value) return;
    if (output.value && !output.value.endsWith("\n")) output.value += "\n";
    output.value += `${value}\n`;
    output.scrollTop = output.scrollHeight;
  }

  function renderProgress() {
    const label = select("#ai-list-progress span:last-child");
    if (!label) return;
    if (progressState.phase === "matching" || progressState.phase === "matched") {
      label.textContent = t("matching", progressState);
      return;
    }
    label.textContent = t("extracting", {
      seconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    });
  }

  function handleProgress(progress) {
    progressState = progress || { phase: "extracting" };
    if (progressState.phase === "matching" && !matchingHeadingShown) {
      appendLine(t("matchHeading"));
      matchingHeadingShown = true;
    }
    if (progressState.phase === "matched") {
      appendLine(progressState.existingName
        ? t("matched", { item: progressState.item, match: progressState.existingName })
        : t("custom", { item: progressState.item }));
    }
    renderProgress();
  }

  function setGenerating(generating) {
    ["#ai-list-text", "#ai-list-server", "#ai-list-model", "#ai-list-refresh", "#ai-list-submit", "#ai-list-cancel"]
      .forEach((selector) => { select(selector).disabled = generating; });
    select("#ai-list-stop").hidden = !generating;
    select("#ai-list-progress").hidden = !generating;
    if (!generating) {
      clearInterval(timer);
      timer = null;
      return;
    }
    const output = select("#ai-list-output");
    output.value = "";
    output.hidden = false;
    startedAt = Date.now();
    progressState = { phase: "extracting" };
    matchingHeadingShown = false;
    renderProgress();
    timer = setInterval(renderProgress, 1000);
  }

  function explainError(error) {
    if (error?.message === "ai_data_not_ready") return t("dataNotReady");
    if (error?.message === "ai_unknown_item") return t("unknownItem", { key: error.detail || "?" });
    if (error?.message === "ai_unsupported_quantity") {
      return t("unsupportedQuantity", { name: error.ingredient || "?" });
    }
    if (error?.name === "AbortError") return t("stopped");
    if (error instanceof OllamaError) {
      if (error.code === "invalid_url") return t("invalidUrl");
      if (error.code === "network_error") return t("network");
      if (error.code === "timeout") return t("timeout");
      if (["invalid_response", "invalid_item_list"].includes(error.code)) return t("badResponse");
      return [error.message, error.details].filter(Boolean).join("\n");
    }
    return error?.message || t("badResponse");
  }

  async function refreshModels() {
    setError("");
    const serverInput = select("#ai-list-server");
    const modelSelect = select("#ai-list-model");
    const refresh = select("#ai-list-refresh");
    const submit = select("#ai-list-submit");
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
      modelSelect.innerHTML = models.map(() => "<option></option>").join("");
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

  async function open(nextMode) {
    if (!state.snapshot) return;
    mode = nextMode;
    setError("");
    select("#ai-list-output").value = "";
    select("#ai-list-output").hidden = true;
    select("#ai-list-server").value = storage.getItem(SERVER_STORAGE_KEY) || DEFAULT_OLLAMA_URL;
    select("#ai-list-cancel").textContent = t("cancel");
    select("#ai-list-submit").disabled = false;
    renderLanguage();
    const dialog = select("#ai-list-dialog");
    if (!dialog.open) dialog.showModal();
    select("#ai-list-text").focus();
    await refreshModels();
  }

  function close() {
    controller?.abort();
    controller = null;
    setGenerating(false);
    const dialog = select("#ai-list-dialog");
    if (dialog?.open) dialog.close();
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const listText = select("#ai-list-text").value.trim();
    const model = select("#ai-list-model").value.trim();
    if (!listText) return setError(t("empty"));
    if (listText.length > MAX_RECIPE_TEXT_CHARS) {
      return setError(t("tooLong", { max: MAX_RECIPE_TEXT_CHARS }));
    }
    if (!model) return setError(t("modelRequired"));
    if (!state.snapshot) return setError(t("dataNotReady"));

    controller = new AbortController();
    setGenerating(true);
    try {
      const baseUrl = normalizeOllamaUrl(select("#ai-list-server").value);
      storage.setItem(SERVER_STORAGE_KEY, baseUrl);
      storage.setItem(MODEL_STORAGE_KEY, model);
      const result = await generateItemListWithOllama({
        baseUrl,
        model,
        listText,
        mode,
        itemOptions: itemOptionsForAi(state.snapshot, mode),
        signal: controller.signal,
        onChunk: appendOutput,
        onProgress: handleProgress,
      });
      if (mode === "stock") {
        const payload = buildAiStockPayload(result.items, state.snapshot, state.stockDraft);
        send("save-ai-stock", payload);
        appendLine(t("stockAdded", { count: result.items.length }));
      } else {
        const rows = buildAiExtraNeedsRows(result.items, state.snapshot, state.customDraft);
        send("replace-custom-grocery", { rows });
        appendLine(t("needsAdded", { count: result.items.length }));
      }
      controller = null;
      setGenerating(false);
      appendLine(t("finalHeading"));
      appendLine(JSON.stringify(result.items, null, 2));
      select("#ai-list-submit").disabled = true;
      select("#ai-list-cancel").textContent = t("close");
    } catch (error) {
      const aborted = controller?.signal.aborted || error?.name === "AbortError";
      controller = null;
      setGenerating(false);
      setError(aborted ? t("stopped") : explainError(error));
    }
  }

  function mount() {
    installAiListUi({
      documentRef,
      select,
      maxTextChars: MAX_RECIPE_TEXT_CHARS,
    });
    renderLanguage();
    select("#add-stock-ai")?.addEventListener("click", () => open("stock"));
    select("#add-needs-ai")?.addEventListener("click", () => open("needs"));
    select("#ai-list-close").addEventListener("click", close);
    select("#ai-list-cancel").addEventListener("click", close);
    select("#ai-list-stop").addEventListener("click", () => controller?.abort());
    select("#ai-list-refresh").addEventListener("click", refreshModels);
    select("#ai-list-server").addEventListener("input", renderPrivacy);
    select("#ai-list-form").addEventListener("submit", submit);
    select("#language-select")?.addEventListener("change", renderLanguage);
    select("#ai-list-dialog").addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
  }

  return { close, mount, open, refreshModels };
}
