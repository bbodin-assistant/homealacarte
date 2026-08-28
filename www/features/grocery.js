import {
  collectPurchaseHistory,
  parsePurchaseBatch,
} from "../core/purchases.js?v=homealacarte-1";

const PURCHASE_STRINGS = {
  en: {
    tab: "Purchases",
    eyebrow: "After shopping",
    title: "Purchases",
    singleTitle: "Add a purchase",
    singleIntro: "Add one purchased item; stock and its price history are updated together.",
    batchTitle: "Add purchases in batch",
    batchIntro: "Paste one item per line with name, quantity, unit and total price. Add “food” or “household” as column 5 when creating a new item.",
    item: "Item",
    newFood: "New food item…",
    newHousehold: "New household item…",
    name: "Name",
    quantity: "Purchased quantity",
    unit: "Unit",
    paidPrice: "Price paid",
    date: "Date",
    store: "Store",
    optional: "Optional",
    addPurchase: "Add purchase",
    batchList: "Purchase list",
    batchPlaceholder: "Tomato; 1250; g; 4.36\nHand soap; 2; bottle; 5.20; household",
    addBatch: "Add purchases",
    history: "History",
    historyIntro: "Chronological view of recorded purchases across all catalogue items.",
    paid: "Paid",
    recordedPrice: "Recorded price",
    source: "Source",
    undated: "Date unavailable",
    emptyHistory: "No purchases recorded yet.",
    purchaseSource: "Purchase",
    itemRequired: "Choose an item.",
    newNameRequired: "Enter a name for the new item.",
    invalidValue: "Quantity must be positive and price must be zero or positive.",
  },
  fr: {
    tab: "Achats",
    eyebrow: "Après les courses",
    title: "Achats",
    singleTitle: "Ajouter un achat",
    singleIntro: "Ajoutez un article acheté : le stock et son historique de prix seront mis à jour ensemble.",
    batchTitle: "Ajouter plusieurs achats",
    batchIntro: "Collez une ligne par article avec nom, quantité, unité et prix total. Ajoutez « food » ou « household » en cinquième colonne pour créer un nouvel article.",
    item: "Article",
    newFood: "Nouvel aliment…",
    newHousehold: "Nouvel article ménager…",
    name: "Nom",
    quantity: "Quantité achetée",
    unit: "Unité",
    paidPrice: "Prix payé",
    date: "Date",
    store: "Magasin",
    optional: "Facultatif",
    addPurchase: "Ajouter l’achat",
    batchList: "Liste d’achats",
    batchPlaceholder: "Tomate; 1250; g; 4,36\nSavon; 2; flacon; 5,20; household",
    addBatch: "Ajouter les achats",
    history: "Historique",
    historyIntro: "Vue chronologique des achats enregistrés pour tous les articles du catalogue.",
    paid: "Payé",
    recordedPrice: "Prix enregistré",
    source: "Source",
    undated: "Date non renseignée",
    emptyHistory: "Aucun achat enregistré pour le moment.",
    purchaseSource: "Achat",
    itemRequired: "Choisissez un article.",
    newNameRequired: "Saisissez le nom du nouvel article.",
    invalidValue: "La quantité doit être positive et le prix doit être positif ou nul.",
  },
};

function purchaseStrings(language) {
  const requested = String(language || "").toLowerCase();
  return PURCHASE_STRINGS[requested]
    || PURCHASE_STRINGS[requested.split("-")[0]]
    || PURCHASE_STRINGS.en;
}

function localDate() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function purchaseId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `purchase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function visibleGroceryCategories(categories = [], hideStocked = false) {
  return categories
    .map((category) => ({
      ...category,
      subcategories: category.subcategories
        .map((subcategory) => ({
          ...subcategory,
          items: subcategory.items.filter((item) => !hideStocked || !item.stock_sufficient),
        }))
        .filter((subcategory) => subcategory.items.length),
    }))
    .filter((category) => category.subcategories.length);
}

export function groceryProgress(grocery) {
  const items = grocery?.items || [];
  const total = items.length;
  const checked = items.filter((item) => item.stock_sufficient).length;
  const remainingTotal = items
    .filter((item) => !item.stock_sufficient)
    .reduce((sum, item) => sum + item.estimated_purchase_price, 0);
  const candidateFullTotal = Number(grocery?.estimated_full_purchase_total);
  const fullTotal = Number.isFinite(candidateFullTotal) && candidateFullTotal >= remainingTotal
    ? candidateFullTotal
    : remainingTotal;
  return { checked, fullTotal, remaining: total - checked, remainingTotal, total };
}

export function groupPurchaseHistoryByDate(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const date = String(row?.date || "");
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(row);
  });
  return [...groups].map(([date, purchases]) => ({ date, purchases }));
}

function purchaseDateLabel(date, language, undatedLabel) {
  if (!date) return undatedLabel;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(language || undefined, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(parsed);
}

export function createGroceryFeature({
  state,
  select,
  translate,
  escapeHtml,
  formatMoney,
  setCountBadge,
  storage,
  send,
  stockPayload,
  extraNeedsPayload,
  openDetails,
}) {
  let mounted = false;

  function updateProgress() {
    const progress = groceryProgress(state.snapshot?.grocery_plan);
    select("#grocery-total").textContent = `${formatMoney(progress.remainingTotal)} / ${formatMoney(
      progress.fullTotal,
    )}`;
    select("#grocery-progress-label").textContent = `${progress.checked} / ${progress.total}`;
    select("#grocery-progress-bar").style.width = `${progress.total
      ? progress.checked / progress.total * 100
      : 0}%`;
    setCountBadge("#grocery-tab-count", progress.remaining);
    select("#grocery-count").textContent = String(progress.remaining);
    select("#grocery-count").hidden = progress.remaining === 0;
  }

  function renderPurchaseLanguage() {
    const strings = purchaseStrings(state.language);
    const labels = {
      "#purchases-tab-label": "tab",
      "#purchases-eyebrow": "eyebrow",
      "#purchases-title": "title",
      "#purchase-single-title": "singleTitle",
      "#purchase-single-intro": "singleIntro",
      "#purchase-batch-title": "batchTitle",
      "#purchase-batch-intro": "batchIntro",
      "#purchase-item-label": "item",
      "#purchase-name-label": "name",
      "#purchase-quantity-label": "quantity",
      "#purchase-unit-label": "unit",
      "#purchase-price-label": "paidPrice",
      "#purchase-date-label": "date",
      "#purchase-store-label": "store",
      "#purchase-add-submit": "addPurchase",
      "#purchase-batch-list-label": "batchList",
      "#purchase-batch-date-label": "date",
      "#purchase-batch-store-label": "store",
      "#purchase-batch-submit": "addBatch",
      "#purchase-history-title": "history",
      "#purchase-history-intro": "historyIntro",
      "#purchase-history-item-label": "item",
      "#purchase-history-quantity-label": "quantity",
      "#purchase-history-paid-label": "paid",
      "#purchase-history-price-label": "recordedPrice",
      "#purchase-history-source-label": "source",
    };
    Object.entries(labels).forEach(([selector, key]) => {
      select(selector).textContent = strings[key];
    });
    select("#purchase-add-store").placeholder = strings.optional;
    select("#purchase-batch-store").placeholder = strings.optional;
    select("#purchase-batch-text").placeholder = strings.batchPlaceholder;
  }

  function purchaseOption() {
    return (state.snapshot?.stock_options || [])
      .find((option) => option.item_key === select("#purchase-add-item").value);
  }

  function setPurchaseItemFields() {
    const strings = purchaseStrings(state.language);
    const selected = select("#purchase-add-item").value;
    const newKind = selected === "__new_food__"
      ? "food"
      : selected === "__new_household__"
        ? "household"
        : "";
    const nameField = select("#purchase-new-name-field");
    const nameInput = select("#purchase-add-name");
    nameField.hidden = !newKind;
    nameInput.required = Boolean(newKind);
    const unitSelect = select("#purchase-add-unit");
    if (newKind === "food") {
      unitSelect.innerHTML = "<option value=\"g\">g</option>";
      return;
    }
    if (newKind === "household") {
      unitSelect.innerHTML = `<option value="unit">${escapeHtml(strings.unit.toLowerCase())}</option>`;
      return;
    }
    const option = purchaseOption();
    if (!option) {
      unitSelect.innerHTML = "";
      return;
    }
    if (option.household) {
      unitSelect.innerHTML = `<option value="unit">${escapeHtml(option.measure_unit)}</option>`;
      return;
    }
    unitSelect.innerHTML = `<option value="g">g</option>${option.measure_unit === "g"
      ? ""
      : `<option value="unit">${escapeHtml(option.measure_unit)}</option>`}`;
    unitSelect.value = option.quantity_unit === "unit" && option.measure_unit !== "g" ? "unit" : "g";
  }

  function renderPurchaseOptions() {
    const strings = purchaseStrings(state.language);
    const options = state.snapshot?.stock_options || [];
    select("#purchase-add-item").innerHTML = [
      "<option value=\"\"></option>",
      ...options.map((option) => (
        `<option value="${escapeHtml(option.item_key)}">${escapeHtml(option.name)}</option>`
      )),
      `<option value="__new_food__">+ ${escapeHtml(strings.newFood)}</option>`,
      `<option value="__new_household__">+ ${escapeHtml(strings.newHousehold)}</option>`,
    ].join("");
    setPurchaseItemFields();
  }

  function renderPurchases() {
    renderPurchaseLanguage();
    renderPurchaseOptions();
    const today = localDate();
    if (!select("#purchase-add-date").value) select("#purchase-add-date").value = today;
    if (!select("#purchase-batch-date").value) select("#purchase-batch-date").value = today;
    const strings = purchaseStrings(state.language);
    const number = new Intl.NumberFormat(state.language || undefined, { maximumFractionDigits: 3 });
    const history = collectPurchaseHistory(state.snapshot).filter((row) => row.purchase);
    setCountBadge("#purchases-tab-count", history.length);
    select("#purchase-list").innerHTML = groupPurchaseHistoryByDate(history).map((group) => `
      <section class="purchase-date-group">
        <h3 class="purchase-date-heading">
          ${group.date ? `<time datetime="${escapeHtml(group.date)}">` : "<span>"}
            ${escapeHtml(purchaseDateLabel(group.date, state.language, strings.undated))}
          ${group.date ? "</time>" : "</span>"}
          <span>${number.format(group.purchases.length)}</span>
        </h3>
        ${group.purchases.map((row) => {
          const purchase = row.purchase;
          const quantity = `${number.format(purchase.quantity)} ${escapeHtml(purchase.unit)}`;
          const paid = formatMoney(purchase.totalPrice);
          const unitLabel = row.household ? row.purchaseUnit || "unit" : "kg";
          const recordedPrice = `${formatMoney(row.price)} / ${escapeHtml(unitLabel)}`;
          const source = purchase.store || strings.purchaseSource;
          return `<div class="purchase-history-row">
            <strong><span>${escapeHtml(row.itemName)}</span></strong>
            <span>${quantity}</span>
            <span>${paid}</span>
            <span>${recordedPrice}</span>
            <span title="${escapeHtml(source)}">${escapeHtml(source)}</span>
          </div>`;
        }).join("")}
      </section>
    `).join("") || `<p class="stock-empty">${escapeHtml(strings.emptyHistory)}</p>`;
  }

  function render() {
    const grocery = state.snapshot.grocery_plan;
    select("#grocery-hide-stocked").checked = state.groceryHideStocked;
    const categories = visibleGroceryCategories(grocery.categories, state.groceryHideStocked);
    select("#grocery-grid").innerHTML = categories.map((category) => `
      <article class="grocery-category">
        <h2>${escapeHtml(category.name)}</h2>
        ${category.subcategories.map((subcategory) => `
          <section class="grocery-subcategory">
            ${subcategory.name ? `<h3>${escapeHtml(subcategory.name)}</h3>` : ""}
            ${subcategory.items.map((item) => {
              const checked = item.stock_sufficient;
              const partial = !checked && Number(item.stock_quantity) > 0;
              const purchase = item.stock_sufficient
                ? translate("stock_enough")
                : partial
                  ? `${translate("in_stock")}: ${escapeHtml(item.stock_quantity_text)} / ${escapeHtml(item.needed_quantity_text)} · ${translate("buy")}: ${escapeHtml(item.purchase_quantity_text)}`
                  : `${translate("buy")}: ${escapeHtml(item.purchase_quantity_text)}`;
              const stockStatus = checked
                ? `<span class="stock-status enough">${escapeHtml(translate("stock_enough"))}</span>`
                : partial
                  ? `<span class="stock-status partial">${escapeHtml(translate("stock_partial"))}: ${escapeHtml(item.stock_quantity_text)}</span>`
                  : "";
              return `<div class="grocery-item ${checked ? "checked stock-covered" : ""} ${partial ? "stock-partial" : ""}" tabindex="0" data-grocery-details="${escapeHtml(encodeURIComponent(item.id))}" aria-label="${escapeHtml(`${translate("details")}: ${item.name}`)}">
                <span class="grocery-item-check">
                  <input type="checkbox" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(`${translate(checked ? "remove_stock" : "add_stock")}: ${item.name}`)}" ${checked ? "checked" : ""}>
                  <span><strong>${escapeHtml(item.name)}</strong><small>${translate("total_need")}: ${escapeHtml(item.needed_quantity_text)} · ${purchase}</small></span>
                </span>
                <span class="grocery-item-end">
                  ${stockStatus}
                  ${checked ? "" : `<span class="price">${formatMoney(item.estimated_purchase_price)}</span>`}
                </span>
              </div>`;
            }).join("")}
          </section>
        `).join("")}
      </article>
    `).join("") || `<p class="grocery-empty">${escapeHtml(translate("empty"))}</p>`;
    updateProgress();
    renderPurchases();
  }

  function purchaseLineFromForm() {
    const strings = purchaseStrings(state.language);
    const selected = select("#purchase-add-item").value;
    if (!selected) throw new Error(strings.itemRequired);
    const quantity = Number(select("#purchase-add-quantity").value);
    const totalPrice = Number(select("#purchase-add-price").value);
    const quantityUnit = select("#purchase-add-unit").value;
    const option = purchaseOption();
    const newKind = selected === "__new_food__"
      ? "food"
      : selected === "__new_household__"
        ? "household"
        : "";
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalPrice) || totalPrice < 0) {
      throw new Error(strings.invalidValue);
    }
    if (newKind) {
      const name = select("#purchase-add-name").value.trim();
      if (!name) throw new Error(strings.newNameRequired);
      return {
        quantity,
        quantity_unit: quantityUnit,
        display_unit: newKind === "food" ? "g" : strings.unit.toLowerCase(),
        total_price: totalPrice,
        new_item: {
          name,
          kind: newKind,
          measure_unit: newKind === "food" ? "g" : strings.unit.toLowerCase(),
        },
      };
    }
    return {
      item_key: selected,
      quantity,
      quantity_unit: quantityUnit,
      display_unit: quantityUnit === "g" ? "g" : option?.measure_unit || "unit",
      total_price: totalPrice,
    };
  }

  function submitPurchase(event) {
    event.preventDefault();
    try {
      const line = purchaseLineFromForm();
      clearTimeout(state.editTimer);
      clearTimeout(state.stockTimer);
      clearTimeout(state.customTimer);
      send("record-purchase", {
        purchase_id: purchaseId(),
        date: select("#purchase-add-date").value,
        store: select("#purchase-add-store").value.trim(),
        lines: [line],
        rows: state.draft,
        stock: stockPayload(),
        customGrocery: extraNeedsPayload(),
      });
      select("#purchase-add-name").value = "";
      select("#purchase-add-quantity").value = "";
      select("#purchase-add-price").value = "";
    } catch (error) {
      select("#purchase-add-item").setCustomValidity(error.message);
      select("#purchase-add-item").reportValidity();
      select("#purchase-add-item").setCustomValidity("");
    }
  }

  function submitPurchaseBatch(event) {
    event.preventDefault();
    const errorPanel = select("#purchase-batch-error");
    errorPanel.textContent = "";
    try {
      const lines = parsePurchaseBatch(select("#purchase-batch-text").value, state.snapshot);
      clearTimeout(state.editTimer);
      clearTimeout(state.stockTimer);
      clearTimeout(state.customTimer);
      send("record-purchase", {
        purchase_id: purchaseId(),
        date: select("#purchase-batch-date").value,
        store: select("#purchase-batch-store").value.trim(),
        lines,
        rows: state.draft,
        stock: stockPayload(),
        customGrocery: extraNeedsPayload(),
      });
      select("#purchase-batch-text").value = "";
    } catch (error) {
      errorPanel.textContent = error?.message || String(error);
    }
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    select("#grocery-hide-stocked").addEventListener("change", (event) => {
      state.groceryHideStocked = event.target.checked;
      storage.setItem("homealacarte-grocery-hide-stocked", String(state.groceryHideStocked));
      render();
    });
    select("#grocery-grid").addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-id]");
      if (!checkbox) return;
      checkbox.closest(".grocery-item").classList.toggle("checked", checkbox.checked);
      clearTimeout(state.editTimer);
      clearTimeout(state.stockTimer);
      clearTimeout(state.customTimer);
      send("set-grocery-stock", {
        itemIds: [checkbox.dataset.id],
        stocked: checkbox.checked,
        rows: state.draft,
        stock: stockPayload(),
        customGrocery: extraNeedsPayload(),
      });
    });
    select("#grocery-grid").addEventListener("click", (event) => {
      if (event.target.closest("input[data-id]")) return;
      const item = event.target.closest("[data-grocery-details]");
      if (item) openDetails(decodeURIComponent(item.dataset.groceryDetails));
    });
    select("#grocery-grid").addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key) || event.target.closest("input[data-id]")) return;
      const item = event.target.closest("[data-grocery-details]");
      if (!item) return;
      event.preventDefault();
      openDetails(decodeURIComponent(item.dataset.groceryDetails));
    });
    select("#purchase-add-item").addEventListener("change", setPurchaseItemFields);
    select("#purchase-add-form").addEventListener("submit", submitPurchase);
    select("#purchase-batch-form").addEventListener("submit", submitPurchaseBatch);
  }

  return { mount, render, renderPurchases, updateProgress };
}
