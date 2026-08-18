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

export const PURCHASE_LAYOUT_CSS = `
  .purchase-entry-grid{grid-template-columns:1fr}
  .receipt-review-row.known-item{border-left:4px solid #4f8a65}
  .receipt-review-row.new-item{border-left:4px solid #4f7eab}
  .receipt-review-row.problem-item{border-left:4px solid #b45e46}
  .receipt-review-row.known-item .receipt-review-status{color:#3f7354;font-weight:800}
  .receipt-review-row.new-item .receipt-review-status{color:#3f6f9b;font-weight:800}
  .receipt-review-row.problem-item .receipt-review-status{color:#9b4f3b;font-weight:800}
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
      status.textContent = match.name;
      status.classList.remove("warning");
    }
    applyRowState(row);
  });
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
  const refresh = () => applyHistoryFallback(documentRef, review);
  const observer = new MutationObserver(refresh);
  observer.observe(list, { childList: true, subtree: true });
  review.addEventListener("change", (event) => {
    const row = event.target.closest?.("[data-receipt-row]");
    if (row) applyRowState(row);
  });
  refresh();
}

export function installPurchaseReviewEnhancements(documentRef = document) {
  installLayout(documentRef);
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
