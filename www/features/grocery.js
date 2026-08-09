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
  }

  return { mount, render, updateProgress };
}
