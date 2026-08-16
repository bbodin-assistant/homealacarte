import { localeLabel } from "../core/data-localization.js?v=homealacarte-80";

export function createShellFeature({
  state,
  select,
  selectAll,
  documentRef,
  historyRef,
  storage,
  translate,
  hasLanguage,
  locales,
  randomizeColorTheme,
  renderStorageStatus,
  renderDataOverview,
  configureDishRanges,
  renderFamily,
  renderMenu,
  renderAutoMenu,
  renderGrocery,
  renderStock,
  renderCustomGrocery,
  renderDishes,
  renderItemsCatalogue,
  send,
  showError,
  dialogClosers,
}) {
  function renderLanguageOptions() {
    const languageSelect = select("#language-select");
    languageSelect.replaceChildren(...locales.map((locale) => {
      const option = documentRef.createElement("option");
      option.value = locale;
      option.textContent = localeLabel(locale, state.language);
      return option;
    }));
    languageSelect.value = state.language;
  }

  function applyTranslations() {
    documentRef.documentElement.lang = state.language;
    renderLanguageOptions();
    selectAll("[data-i18n]").forEach((node) => {
      node.textContent = translate(node.dataset.i18n);
    });
    selectAll("[data-i18n-placeholder]").forEach((node) => {
      node.placeholder = translate(node.dataset.i18nPlaceholder);
    });
    selectAll("[data-i18n-title]").forEach((node) => {
      node.title = translate(node.dataset.i18nTitle);
    });
    renderStorageStatus(state.storageStatus);
  }

  function setGroceryMode(mode) {
    const safeMode = ["list", "stock", "needs"].includes(mode) ? mode : "list";
    state.groceryMode = safeMode;
    selectAll("[data-grocery-mode]").forEach((button) => {
      const active = button.dataset.groceryMode === safeMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    selectAll("[data-grocery-panel]").forEach((panel) => {
      const active = panel.dataset.groceryPanel === safeMode;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  function setMenuMode(mode) {
    const safeMode = mode === "automatic" ? "automatic" : "manual";
    state.menuMode = safeMode;
    storage.setItem("homealacarte-menu-mode", safeMode);
    selectAll('[data-menu-mode]').forEach((button) => {
      const active = button.dataset.menuMode === safeMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    selectAll('[data-menu-panel]').forEach((panel) => {
      const active = panel.dataset.menuPanel === safeMode;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  function render() {
    if (!state.snapshot) return;
    applyTranslations();
    setMenuMode(state.menuMode);
    setGroceryMode(state.groceryMode);
    renderFamily();
    renderMenu();
    renderAutoMenu();
    renderGrocery();
    renderCustomGrocery();
    renderStock();
    renderGroceryModeCounts();
    configureDishRanges();
    renderDishes();
    renderItemsCatalogue();
    if (state.activeTab === "data") renderDataOverview();
  }

  function setCountBadge(selector, count) {
    const badge = select(selector);
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  function renderGroceryModeCounts() {
    const remaining = state.snapshot.grocery_plan.items
      .filter((item) => !item.stock_sufficient).length;
    select("#grocery-count").textContent = String(remaining);
    select("#grocery-count").hidden = remaining === 0;
    setCountBadge("#grocery-tab-count", remaining);
    setCountBadge("#stock-tab-count", state.stockDraft.length);
    setCountBadge("#needs-tab-count", state.customDraft.length);
  }

  function renderSummary() {
    const { counts, grocery_plan: grocery } = state.snapshot;
    const cards = [
      [counts.ingredients, translate("ingredients")],
      [counts.dishes, translate("dishes")],
      [counts.menu, translate("meals")],
      [grocery.items.length, translate("grocery_items")],
    ];
    select("#summary-cards").innerHTML = cards.map(([value, label]) =>
      `<div class="summary-card"><strong>${value}</strong><span>${label}</span></div>`,
    ).join("");
  }

  function openConfirmation({ title, message, confirmLabel, action }) {
    state.pendingConfirmation = action;
    select("#confirm-dialog-title").textContent = title;
    select("#confirm-dialog-message").textContent = message;
    select("#confirm-dialog-accept").textContent = confirmLabel;
    const dialog = select("#confirm-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    select("#confirm-dialog-cancel").focus();
  }

  function closeConfirmation() {
    state.pendingConfirmation = null;
    const dialog = select("#confirm-dialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function enableBackdropDismissal(selector, closeDialog) {
    const dialog = select(selector);
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const clickedOutsideWindow = event.clientX < bounds.left
        || event.clientX > bounds.right
        || event.clientY < bounds.top
        || event.clientY > bounds.bottom;
      if (clickedOutsideWindow) closeDialog();
    });
  }

  function switchTab(tab) {
    state.activeTab = tab;
    selectAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    selectAll(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === tab));
    historyRef.replaceState(null, "", `#${tab}`);
    if (tab === "data") renderDataOverview();
  }

  function selectLanguage(language) {
    if (!hasLanguage(language) || language === state.language) return;
    state.language = language;
    storage.setItem("homealacarte-language", state.language);
    if (state.snapshot) render();
    else applyTranslations();
    if (state.lastError) showError(state.lastError.message, state.lastError.code);
    send("set-language", { language: state.language });
  }

  function mount() {
  documentRef.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-tab]");
    if (nav) {
      event.preventDefault();
      switchTab(nav.dataset.tab);
    }
    const groceryMode = event.target.closest("[data-grocery-mode]");
    if (groceryMode) {
      setGroceryMode(groceryMode.dataset.groceryMode);
      storage.setItem("homealacarte-grocery-mode", state.groceryMode);
    }
  });
  select("#color-my-life").addEventListener("click", randomizeColorTheme);
  select("#confirm-dialog-close").addEventListener("click", closeConfirmation);
  select("#confirm-dialog-cancel").addEventListener("click", closeConfirmation);
  select("#confirm-dialog").addEventListener("close", () => {
    state.pendingConfirmation = null;
  });
  select("#confirm-dialog-accept").addEventListener("click", async () => {
    const action = state.pendingConfirmation;
    closeConfirmation();
    if (!action) return;
    try {
      await action();
    } catch (error) {
      showError(error?.message || String(error));
    }
  });
  const languageSelect = select("#language-select");
  languageSelect.addEventListener("input", (event) => selectLanguage(event.target.value));
  languageSelect.addEventListener("change", (event) => selectLanguage(event.target.value));
  dialogClosers.forEach(([selector, closeDialog]) => {
    enableBackdropDismissal(selector, closeDialog);
  });
  }

  return {
    applyTranslations,
    closeConfirmation,
    mount,
    openConfirmation,
    render,
    setCountBadge,
    setGroceryMode,
    setMenuMode,
    switchTab,
  };
}
