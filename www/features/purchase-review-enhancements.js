function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(/\s+/).filter((token) => token.length >= 3));
}

function reviewStrings(documentRef) {
  const french = String(documentRef?.documentElement?.lang || "").toLowerCase().startsWith("fr");
  return french ? {
    foodWeight: "Ce nouvel aliment a besoin de son poids total en grammes. Saisissez-le ci-dessous ou associez l’article au catalogue.",
    fixRows: "Corrigez les lignes rouges avant d’appliquer les achats. La première ligne à corriger est affichée ci-dessous.",
    invalidRow: "Vérifiez le nom, la quantité, l’unité et le prix de cette ligne.",
    matched: "Correspondance catalogue",
    newItem: "Nouvel article",
    weightHint: "Requis pour créer un nouvel aliment et calculer son prix au kg et son stock.",
    weightLabel: "Poids total (g)",
    weightReady: "Poids renseigné · prêt à créer",
  } : {
    foodWeight: "This new food item needs its total weight in grams. Enter it below or match the item to the catalogue.",
    fixRows: "Fix the red rows before applying purchases. The first row that needs attention is shown below.",
    invalidRow: "Check the name, quantity, unit and price on this row.",
    matched: "Catalogue match",
    newItem: "New item",
    weightHint: "Required to create a new food item and calculate its price per kg and stock.",
    weightLabel: "Total weight (g)",
    weightReady: "Weight entered · ready to create",
  };
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)).toString() : "";
}

export const PURCHASE_LAYOUT_CSS = `
  .purchase-entry-grid{grid-template-columns:1fr}
  .receipt-review-row.known-item{border:2px solid #4f8a65;background:#dfeee4}
  .receipt-review-row.new-item{border:2px solid #4f7eab;background:#ddeaf6}
  .receipt-review-row.problem-item{border:2px solid #b45e46;background:#f5ddd5}
  .receipt-review-row.known-item .receipt-review-field input,.receipt-review-row.known-item .receipt-review-field select{border-color:#7eac8d;background:#eef7f1}
  .receipt-review-row.new-item .receipt-review-field input,.receipt-review-row.new-item .receipt-review-field select{border-color:#83a7c8;background:#edf4fb}
  .receipt-review-row.problem-item .receipt-review-field input,.receipt-review-row.problem-item .receipt-review-field select{border-color:#c98d7c;background:#fbeeea}
  .receipt-review-row.known-item .receipt-review-status{color:#3f7354;font-weight:800}
  .receipt-review-row.new-item .receipt-review-status{color:#3f6f9b;font-weight:800}
  .receipt-review-row.problem-item .receipt-review-status{color:#9b4f3b;font-weight:800}
  .receipt-review-weight{grid-column:1/-1;padding:9px;border:1px dashed currentColor;border-radius:8px}
  .receipt-review-weight small{color:var(--muted);font-size:9px;line-height:1.35}
  .receipt-review-weight[hidden]{display:none}
`;

export function matchReceiptLabelFromHistory(label, candidates = []) {
  const target = normalizeText(label);
  const targetTokens = tokenSet(label);
  if (!target || !targetTokens.size) return null;

  const scored = (candidates || []).map((candidate) => {
    const history = normalizeText((candidate.history || []).join(" "));
    if (!history) return null;
    const historyTokens = tokenSet(history);
    const common = [...targetTokens].filter((token) => historyTokens.has(token)).length;
    const score = history.includes(target) ? 2 : common / targetTokens.size;
    return { candidate, common, score };
  }).filter(Boolean).sort((left, right) => right.score - left.score || right.common - left.common);

  const best = scored[0];
  const second = scored[1];
  if (!best) return null;
  if (best.score < 2 && (best.common < 2 || best.score < 0.8)) return null;
  if (second && second.score >= best.score - (best.score >= 2 ? 0 : 0.15)) return null;
  return best.candidate;
}

export function purchaseReviewState({ matched = false, invalid = false, warning = false } = {}) {
  if (invalid || warning) return "problem-item";
  return matched ? "known-item" : "new-item";
}

export function resolvePurchaseReviewWeight({
  matched = false,
  kind = "",
  quantity = 0,
  unit = "",
  weight = "",
} = {}) {
  const required = !matched && kind === "food";
  if (!required) return { required: false, valid: true, grams: 0 };

  const explicit = positiveNumber(weight);
  if (explicit) return { required: true, valid: true, grams: explicit };

  const amount = positiveNumber(quantity);
  const normalizedUnit = normalizeText(unit);
  if (amount && normalizedUnit === "g") {
    return { required: true, valid: true, grams: amount };
  }
  if (amount && normalizedUnit === "kg") {
    return { required: true, valid: true, grams: amount * 1000 };
  }
  return { required: true, valid: false, grams: 0 };
}

function catalogueCandidates(documentRef) {
  const source = documentRef.querySelector("#purchase-add-item");
  if (!source) return [];
  const candidates = [...source.options]
    .filter((option) => option.value && !option.value.startsWith("__new_"))
    .map((option) => ({ value: option.value, name: option.textContent.trim(), history: [] }));
  const byName = new Map(candidates.map((candidate) => [normalizeText(candidate.name), candidate]));

  documentRef.querySelectorAll("#purchase-list .purchase-history-row").forEach((row) => {
    const itemName = row.querySelector("strong span")?.textContent?.trim();
    const sourceSpans = [...row.querySelectorAll(":scope > span")];
    const source = sourceSpans.at(-1)?.getAttribute("title") || sourceSpans.at(-1)?.textContent?.trim();
    const candidate = byName.get(normalizeText(itemName));
    if (candidate && source) candidate.history.push(source);
  });
  return candidates;
}

function applyRowState(row) {
  const matchSelect = row.querySelector("[data-receipt-match]");
  const status = row.querySelector("[data-receipt-status]");
  const nextState = purchaseReviewState({
    matched: Boolean(matchSelect?.value),
    invalid: row.classList.contains("invalid"),
    warning: status?.classList.contains("warning"),
  });
  row.classList.remove("known-item", "new-item", "problem-item");
  row.classList.add(nextState);
}

function refreshReviewStates(review) {
  review.querySelectorAll("[data-receipt-row]").forEach(applyRowState);
}

function applyHistoryFallback(documentRef, review) {
  const candidates = catalogueCandidates(documentRef);
  if (!candidates.length) {
    refreshReviewStates(review);
    return;
  }

  review.querySelectorAll("[data-receipt-row]").forEach((row) => {
    const matchSelect = row.querySelector("[data-receipt-match]");
    if (!matchSelect || matchSelect.value) {
      applyRowState(row);
      return;
    }
    const label = row.querySelector("[data-receipt-name]")?.value?.trim();
    const match = matchReceiptLabelFromHistory(label, candidates);
    if (!match || ![...matchSelect.options].some((option) => option.value === match.value)) {
      applyRowState(row);
      return;
    }

    matchSelect.value = match.value;
    row.classList.remove("invalid");
    const status = row.querySelector("[data-receipt-status]");
    if (status) {
      if (status.textContent !== match.name) status.textContent = match.name;
      status.classList.remove("warning");
    }
    applyRowState(row);
  });
}

function setStatus(status, text, warning = false) {
  if (!status) return;
  if (status.textContent !== text) status.textContent = text;
  status.classList.toggle("warning", warning);
}

function ensureWeightControl(documentRef, row) {
  let field = row.querySelector("[data-receipt-weight-field]");
  if (field) return field;
  const t = reviewStrings(documentRef);
  field = documentRef.createElement("label");
  field.className = "receipt-review-field receipt-review-weight";
  field.dataset.receiptWeightField = "";
  field.hidden = true;
  field.innerHTML = `<span>${t.weightLabel}</span><input data-receipt-weight type="number" min="0.000000001" step="any" inputmode="decimal"><small>${t.weightHint}</small>`;
  row.querySelector("[data-receipt-status]")?.before(field);
  return field;
}

function validateReviewRow(documentRef, row) {
  const t = reviewStrings(documentRef);
  const nameInput = row.querySelector("[data-receipt-name]");
  const matchSelect = row.querySelector("[data-receipt-match]");
  const quantityInput = row.querySelector("[data-receipt-quantity]");
  const unitInput = row.querySelector("[data-receipt-unit]");
  const priceInput = row.querySelector("[data-receipt-price]");
  const kindSelect = row.querySelector("[data-receipt-kind]");
  const status = row.querySelector("[data-receipt-status]");
  const weightField = ensureWeightControl(documentRef, row);
  const weightInput = weightField.querySelector("[data-receipt-weight]");

  const matched = Boolean(matchSelect?.value);
  const kind = kindSelect?.value || "";
  let weight = resolvePurchaseReviewWeight({
    matched,
    kind,
    quantity: quantityInput?.value,
    unit: unitInput?.value,
    weight: weightInput?.value,
  });
  weightField.hidden = !weight.required;

  if (weight.required && !weightInput.value && weight.valid) {
    weightInput.value = cleanNumber(weight.grams);
    weight = resolvePurchaseReviewWeight({
      matched,
      kind,
      quantity: quantityInput?.value,
      unit: unitInput?.value,
      weight: weightInput.value,
    });
  }

  if (weight.required && !weight.valid) {
    row.classList.add("invalid");
    setStatus(status, t.foodWeight, true);
    applyRowState(row);
    return false;
  }

  if (weight.required) {
    quantityInput.value = cleanNumber(weight.grams);
    unitInput.value = "g";
  }

  const quantity = positiveNumber(quantityInput?.value);
  const price = Number(priceInput?.value);
  const validBasics = Boolean(nameInput?.value?.trim())
    && quantity > 0
    && Boolean(unitInput?.value?.trim())
    && Number.isFinite(price)
    && price >= 0;
  if (!validBasics) {
    row.classList.add("invalid");
    setStatus(status, t.invalidRow, true);
    applyRowState(row);
    return false;
  }

  row.classList.remove("invalid");
  if (matched) {
    setStatus(status, matchSelect.selectedOptions?.[0]?.textContent?.trim() || t.matched, false);
  } else if (weight.required) {
    setStatus(status, t.weightReady, false);
  } else {
    setStatus(status, t.newItem, false);
  }
  applyRowState(row);
  return true;
}

function validateReview(documentRef, review) {
  let firstInvalid = null;
  review.querySelectorAll("[data-receipt-row]").forEach((row) => {
    if (!validateReviewRow(documentRef, row) && !firstInvalid) firstInvalid = row;
  });
  if (!firstInvalid) return true;

  const errorPanel = documentRef.querySelector("#purchase-batch-error");
  if (errorPanel) errorPanel.textContent = reviewStrings(documentRef).fixRows;
  firstInvalid.scrollIntoView?.({ behavior: "smooth", block: "center" });
  const weightField = firstInvalid.querySelector("[data-receipt-weight-field]");
  const focusTarget = !weightField?.hidden
    ? weightField.querySelector("[data-receipt-weight]")
    : firstInvalid.querySelector("input,select");
  focusTarget?.focus?.();
  return false;
}

function installSubmitValidation(documentRef) {
  if (documentRef.documentElement.dataset.purchaseReviewValidationInstalled === "true") return;
  documentRef.documentElement.dataset.purchaseReviewValidationInstalled = "true";
  documentRef.addEventListener("submit", (event) => {
    if (event.target?.id !== "purchase-batch-form") return;
    const review = documentRef.querySelector("#purchase-receipt-review");
    if (!review || review.hidden) return;
    const errorPanel = documentRef.querySelector("#purchase-batch-error");
    if (errorPanel) errorPanel.textContent = "";
    if (validateReview(documentRef, review)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);
}

function installLayout(documentRef) {
  if (documentRef.querySelector("#purchase-review-enhancement-styles")) return;
  const style = documentRef.createElement("style");
  style.id = "purchase-review-enhancement-styles";
  style.textContent = PURCHASE_LAYOUT_CSS;
  documentRef.head.append(style);
}

function attachReview(documentRef, review) {
  if (!review || review.dataset.historyFallbackInstalled === "true") return;
  review.dataset.historyFallbackInstalled = "true";
  const list = review.querySelector(".receipt-review-list") || review;
  const refresh = () => {
    applyHistoryFallback(documentRef, review);
    review.querySelectorAll("[data-receipt-row]").forEach((row) => validateReviewRow(documentRef, row));
  };
  const observer = new MutationObserver(refresh);
  observer.observe(list, { childList: true, subtree: true });
  review.addEventListener("change", (event) => {
    const row = event.target.closest?.("[data-receipt-row]");
    if (row) validateReviewRow(documentRef, row);
  });
  review.addEventListener("input", (event) => {
    const row = event.target.closest?.("[data-receipt-row]");
    if (row) validateReviewRow(documentRef, row);
  });
  refresh();
}

export function installPurchaseReviewEnhancements(documentRef = document) {
  installLayout(documentRef);
  installSubmitValidation(documentRef);
  const existing = documentRef.querySelector("#purchase-receipt-review");
  if (existing) {
    attachReview(documentRef, existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const review = documentRef.querySelector("#purchase-receipt-review");
    if (!review) return;
    observer.disconnect();
    attachReview(documentRef, review);
  });
  observer.observe(documentRef.body, { childList: true, subtree: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => installPurchaseReviewEnhancements(document), { once: true });
  } else {
    installPurchaseReviewEnhancements(document);
  }
}
