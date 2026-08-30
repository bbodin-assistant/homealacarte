export function createPriceHistoryEditor({ select, translate, escapeHtml }) {
  function payload(selector) {
    return [...select(selector).querySelectorAll(".item-price-history-row")].map((row) => {
      const priceInput = row.querySelector("[data-price-observation-price]");
      return {
        date: row.querySelector("[data-price-observation-date]").value,
        price: priceInput.value === "" ? Number.NaN : Number(priceInput.value),
        price_basis: row.querySelector("[data-price-observation-basis]")?.value
          || row.dataset.priceObservationBasis
          || "purchase_unit",
        description: row.querySelector("[data-price-observation-description]").value.trim(),
        ...(row.dataset.priceObservationPurchase
          ? { purchase: JSON.parse(row.dataset.priceObservationPurchase) }
          : {}),
      };
    });
  }

  const isValid = (history) => history.every((observation) => (
    Number.isFinite(observation.price) && observation.price >= 0
  ));

  function rowMarkup(observation = {}, allowKg = false) {
    const basis = observation.price_basis || (allowKg ? "kg" : "purchase_unit");
    return `
      <div class="item-price-history-row"${observation.purchase
        ? ` data-price-observation-purchase="${escapeHtml(JSON.stringify(observation.purchase))}"`
        : ""}>
        <label class="item-price-history-date"><span class="sr-only">${escapeHtml(translate("observation_date"))}</span><input type="text" inputmode="numeric" placeholder="${escapeHtml(translate("date_format_hint"))}" value="${escapeHtml(observation.date || "")}" data-price-observation-date></label>
        <label class="item-price-history-price"><span class="sr-only">${escapeHtml(translate("observed_price"))}</span><input type="number" min="0" step="any" value="${escapeHtml(observation.price ?? "")}" data-price-observation-price required></label>
        <label class="item-price-history-basis"><span class="sr-only">${escapeHtml(translate("price_basis"))}</span><select data-price-observation-basis>${allowKg ? `<option value="kg"${basis === "kg" ? " selected" : ""}>${escapeHtml(translate("price_basis_kg"))}</option>` : ""}<option value="purchase_unit"${basis === "purchase_unit" ? " selected" : ""}>${escapeHtml(translate("price_basis_purchase_unit"))}</option></select></label>
        <label class="item-price-history-description"><span class="sr-only">${escapeHtml(translate("observation_description"))}</span><input value="${escapeHtml(observation.description || "")}" data-price-observation-description></label>
        <button class="icon-button remove-price-observation" type="button" aria-label="${escapeHtml(translate("remove_price_observation"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>
      </div>`;
  }

  function updateEmptyState(selector) {
    const list = select(selector);
    const empty = list.querySelector(".item-price-history-empty");
    if (list.querySelector(".item-price-history-row")) empty?.remove();
    else if (!empty) list.innerHTML = `<p class="item-price-history-empty">${escapeHtml(translate("no_price_observations"))}</p>`;
  }

  function render(selector, history = [], allowKg = false) {
    const list = select(selector);
    list.dataset.allowKg = allowKg ? "true" : "false";
    list.innerHTML = history.map((row) => rowMarkup(row, allowKg)).join("");
    updateEmptyState(selector);
  }

  function add(selector) {
    const list = select(selector);
    list.querySelector(".item-price-history-empty")?.remove();
    list.insertAdjacentHTML("beforeend", rowMarkup({}, list.dataset.allowKg === "true"));
    list.querySelector(".item-price-history-row:last-child [data-price-observation-date]").focus();
  }

  return { add, isValid, payload, render, updateEmptyState };
}
