const RECEIPT_STRINGS = {
  en: {
    intro: "Paste the receipt text as-is. Review the parsed rows before applying. Structured ;, | or tab-separated rows are still accepted.",
    placeholder: "FRUITS\nPOMME GOLDEN DELICIOUS 1,48 € 11\nPesée manuelle\n0,530 kg x 2,79 €/kg",
    reviewTitle: "Review parsed receipt",
    reviewIntro: "Check catalogue matches, quantities and prices. Rows marked “weight needed” must be matched to an existing item or given a g/kg weight before applying.",
    receiptItem: "Receipt item",
    catalogue: "Catalogue match",
    quantity: "Quantity",
    unit: "Unit",
    paid: "Paid",
    kind: "Kind",
    newItem: "Create new item",
    food: "Food",
    household: "Household",
    apply: "Apply purchases",
    parse: "Review purchases",
    matched: "Matched",
    new: "New item",
    weightNeeded: "Weight needed",
    invalidRow: "Check this row.",
    noProducts: "No receipt product lines were found.",
    foodWeight: "A new food item needs a g or kg weight. Match it to the catalogue or enter its weight.",
  },
  fr: {
    intro: "Collez le texte du ticket tel quel. Vérifiez les lignes détectées avant de les appliquer. Les lignes structurées séparées par ;, | ou tabulation restent acceptées.",
    placeholder: "FRUITS\nPOMME GOLDEN DELICIOUS 1,48 € 11\nPesée manuelle\n0,530 kg x 2,79 €/kg",
    reviewTitle: "Vérifier le ticket détecté",
    reviewIntro: "Vérifiez les correspondances catalogue, les quantités et les prix. Les lignes « poids requis » doivent être associées à un article existant ou recevoir un poids en g/kg avant application.",
    receiptItem: "Article du ticket",
    catalogue: "Correspondance catalogue",
    quantity: "Quantité",
    unit: "Unité",
    paid: "Payé",
    kind: "Type",
    newItem: "Créer un nouvel article",
    food: "Aliment",
    household: "Ménager",
    apply: "Appliquer les achats",
    parse: "Vérifier les achats",
    matched: "Correspondance",
    new: "Nouvel article",
    weightNeeded: "Poids requis",
    invalidRow: "Vérifiez cette ligne.",
    noProducts: "Aucune ligne d’article n’a été trouvée dans le ticket.",
    foodWeight: "Un nouvel aliment nécessite un poids en g ou kg. Associez-le au catalogue ou saisissez son poids.",
  },
};

function strings(language = "") {
  const requested = String(language).toLowerCase();
  return RECEIPT_STRINGS[requested]
    || RECEIPT_STRINGS[requested.split("-")[0]]
    || RECEIPT_STRINGS.en;
}

function decimal(value) {
  return Number(String(value || "").trim().replace(/\u00a0/g, "").replace(/\s+/g, "").replace(",", "."));
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)).toString() : "";
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MATCH_STOP_WORDS = new Set([
  "u", "ss", "bio", "prix", "mini", "sachet", "sach", "barq", "barquette", "bte",
  "boite", "pet", "can", "tr", "bk", "uvci", "ls", "nat", "nature", "origine",
  "france", "offert", "pieces", "piece", "x", "de", "du", "des", "la", "le", "les",
]);

function matchTokens(value) {
  const withoutPacks = String(value || "")
    .replace(/\b\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|cl|ml)\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|l|cl|ml)\b/gi, " ")
    .replace(/\b(?:bte|tr|sach|sachet|barq|barquette)\.?\s*x?\s*\d+\b/gi, " ")
    .replace(/\b\d+\s*(?:pieces?|fruits?|tranches?)\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*%\b/g, " ");
  return normalizeName(withoutPacks)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !MATCH_STOP_WORDS.has(token));
}

function candidateMatch(options, label) {
  const target = matchTokens(label);
  if (!target.length) return null;
  const targetSet = new Set(target);
  const scored = (options || []).map((option) => {
    const candidate = matchTokens(option.name);
    if (!candidate.length) return null;
    const candidateSet = new Set(candidate);
    const unmatched = [...candidateSet];
    const common = [...targetSet].reduce((count, token) => {
      const index = unmatched.findIndex((candidateToken) => (
        candidateToken === token
        || (Math.min(candidateToken.length, token.length) >= 4
          && (candidateToken.startsWith(token) || token.startsWith(candidateToken)))
      ));
      if (index < 0) return count;
      unmatched.splice(index, 1);
      return count + 1;
    }, 0);
    const score = common / Math.min(targetSet.size, candidateSet.size);
    const exact = target.join(" ") === candidate.join(" ");
    return { option, common, score: exact ? 2 : score };
  }).filter(Boolean).sort((left, right) => right.score - left.score || right.common - left.common);
  const best = scored[0];
  const second = scored[1];
  if (!best) return null;
  if (best.score >= 2) return best.option;
  if (best.common < 2 || best.score < 0.7) return null;
  if (second && second.score >= best.score - 0.15) return null;
  return best.option;
}

function householdCategory(category) {
  const value = normalizeName(category);
  return ["entretien", "menage", "maison", "nettoy", "lessive", "hygiene", "papier", "poubelle", "vaisselle", "desinfect", "parfumerie", "protection auditive"]
    .some((needle) => value.includes(needle));
}

function unitAmount(value, unit) {
  const amount = decimal(value);
  const normalized = String(unit || "").toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (normalized === "kg") return amount * 1000;
  if (normalized === "g") return amount;
  if (["l", "litre", "litres"].includes(normalized)) return amount * 1000;
  if (normalized === "cl") return amount * 10;
  if (normalized === "ml") return amount;
  return 0;
}

function packageAmount(label, packCount) {
  const source = String(label || "");
  const multiplier = Math.max(1, Number(packCount) || 1);
  const massMultipacks = [...source.matchAll(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi)];
  if (massMultipacks.length) {
    const [, count, amount, unit] = massMultipacks.at(-1);
    return { quantity: multiplier * Number(count) * unitAmount(amount, unit), unit: "g" };
  }
  const masses = [...source.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi)];
  if (masses.length) {
    const [, amount, unit] = masses.at(-1);
    return { quantity: multiplier * unitAmount(amount, unit), unit: "g" };
  }
  const volumeMultipacks = [...source.matchAll(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(litres?|l|cl|ml)\b/gi)];
  if (volumeMultipacks.length) {
    const [, rawCount, amount, unit] = volumeMultipacks.at(-1);
    const free = /\+\s*1\s+offert/i.test(source) ? 1 : 0;
    return { quantity: multiplier * (Number(rawCount) + free) * unitAmount(amount, unit), unit: "ml" };
  }
  const volumes = [...source.matchAll(/(\d+(?:[.,]\d+)?)\s*(litres?|l|cl|ml)\b/gi)];
  if (volumes.length) {
    const [, amount, unit] = volumes.at(-1);
    return { quantity: multiplier * unitAmount(amount, unit), unit: "ml" };
  }
  const explicitCounts = [
    ...source.matchAll(/\b(?:bte|boite|tr|sach|sachet|barq|barquette)\.?\s*x\s*(\d+)\b/gi),
    ...source.matchAll(/\bx\s*(\d+)\b/gi),
    ...source.matchAll(/\b(\d+)\s*(?:pieces?|fruits?|tranches?)\b/gi),
  ];
  if (explicitCounts.length) {
    return { quantity: multiplier * Number(explicitCounts.at(-1)[1]), unit: "unit" };
  }
  return { quantity: multiplier, unit: "unit" };
}

function catalogueVolume(amount, suggested) {
  if (amount.unit !== "ml") return amount;
  if (!suggested) return amount;
  const measureUnit = normalizeName(suggested?.measureUnit);
  if (measureUnit === "ml") return amount;
  if (measureUnit === "cl") {
    return { quantity: amount.quantity / 10, unit: suggested.measureUnit || "cl" };
  }
  if (["l", "litre", "litres"].includes(measureUnit)) {
    return { quantity: amount.quantity / 1000, unit: suggested.measureUnit || "L" };
  }
  return { quantity: amount.quantity, unit: "g" };
}

function householdPackageCount(label, packCount) {
  const volumeMultipacks = [...String(label || "").matchAll(
    /(\d+)\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:litres?|l|cl|ml)\b/gi,
  )];
  const innerCount = volumeMultipacks.length
    ? Number(volumeMultipacks.at(-1)[1])
    : 1;
  return Math.max(1, Number(packCount) || 1) * innerCount;
}

function productLine(line) {
  const match = String(line || "").match(/^(.*?)\s+(\d+(?:[.,]\d{1,2})?)\s*€(?:\s+\d+)?\s*$/);
  if (!match || !match[1].trim()) return null;
  return { label: match[1].trim(), totalPrice: decimal(match[2]) };
}

function countLine(line) {
  const match = String(line || "").match(/^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:EUR|€)\s*$/i);
  return match ? { count: decimal(match[1]), unitPrice: decimal(match[2]) } : null;
}

function weighedLine(line) {
  const match = String(line || "").match(/^(\d+(?:[.,]\d+)?)\s*kg\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*€\s*\/\s*kg\s*$/i);
  return match ? { grams: decimal(match[1]) * 1000, pricePerKg: decimal(match[2]) } : null;
}

function mergeEntries(entries) {
  const merged = [];
  const byKey = new Map();
  for (const entry of entries) {
    const key = [normalizeName(entry.label), normalizeName(entry.category), entry.suggested?.value || "", entry.unit, entry.kind].join("\u0000");
    const existing = byKey.get(key);
    if (!existing) {
      const copy = { ...entry };
      byKey.set(key, copy);
      merged.push(copy);
      continue;
    }
    existing.quantity += entry.quantity;
    existing.totalPrice += entry.totalPrice;
    existing.sourceLines.push(...entry.sourceLines);
  }
  return merged;
}

export function parseSupermarketReceipt(receiptText, catalogueOptions = []) {
  const sourceLines = String(receiptText || "").split(/\r?\n/);
  let category = "";
  let pending = null;
  const entries = [];

  function finalize() {
    if (!pending) return;
    const kind = householdCategory(pending.category) ? "household" : "food";
    const suggested = candidateMatch(catalogueOptions, pending.label);
    let amount;
    if (kind === "household") {
      amount = {
        quantity: householdPackageCount(pending.label, pending.packCount),
        unit: "unit",
      };
    } else if (pending.weighedGrams > 0) {
      amount = { quantity: pending.weighedGrams, unit: "g" };
    } else {
      amount = packageAmount(pending.label, pending.packCount);
      amount = catalogueVolume(amount, suggested);
      const suggestedPackageGrams = Number(suggested?.purchaseQuantityGrams || 0);
      if (amount.unit === "unit" && suggestedPackageGrams > 0) {
        amount = {
          quantity: pending.packCount * suggestedPackageGrams,
          unit: "g",
        };
      }
    }
    entries.push({
      label: pending.label,
      category: pending.category,
      totalPrice: pending.totalPrice,
      quantity: amount.quantity,
      unit: amount.unit,
      kind,
      suggested,
      sourceLines: [...pending.sourceLines],
      weightNeeded: !suggested && kind === "food" && amount.unit !== "g",
    });
    pending = null;
  }

  sourceLines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const product = productLine(line);
    if (product) {
      finalize();
      pending = { ...product, category, packCount: 1, weighedGrams: 0, sourceLines: [index + 1] };
      return;
    }
    if (pending && /^pes[ée]e?\s+manuelle$/i.test(line.normalize("NFC"))) {
      pending.sourceLines.push(index + 1);
      return;
    }
    if (pending) {
      const weighed = weighedLine(line);
      if (weighed) {
        pending.weighedGrams = weighed.grams;
        pending.sourceLines.push(index + 1);
        return;
      }
      const count = countLine(line);
      if (count) {
        pending.packCount = count.count;
        pending.sourceLines.push(index + 1);
        return;
      }
    }
    finalize();
    category = line;
  });
  finalize();

  if (!entries.length) throw new Error(strings("en").noProducts);
  return mergeEntries(entries);
}

export function looksLikeStructuredPurchase(text) {
  return String(text || "").split(/\r?\n/)
    .some((line) => line.trim() && (line.includes(";") || line.includes("\t") || line.includes("|")));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function catalogueFromDocument(documentRef) {
  const select = documentRef.querySelector("#purchase-add-item");
  if (!select) return [];
  return [...select.options]
    .filter((option) => option.value && !option.value.startsWith("__new_"))
    .map((option) => ({
      value: option.value,
      name: option.textContent.trim(),
      household: option.dataset.household === "true",
      purchaseQuantityGrams: Number(option.dataset.purchaseGrams || 0),
      measureUnit: option.dataset.measureUnit || "",
    }));
}

function installStyles(documentRef) {
  if (documentRef.querySelector("#receipt-purchases-styles")) return;
  const style = documentRef.createElement("style");
  style.id = "receipt-purchases-styles";
  style.textContent = `
    .receipt-review{grid-column:1/-1;display:grid;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
    .receipt-review[hidden]{display:none}.receipt-review-heading{display:grid;gap:3px}.receipt-review-heading strong{font-size:12px}.receipt-review-heading small{color:var(--muted);font-size:10px;line-height:1.45}
    .receipt-review-list{display:grid;gap:8px}.receipt-review-row{display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(170px,1.1fr) 90px 76px 90px 100px;gap:7px;align-items:end;padding:9px;border:1px solid var(--line);border-radius:9px;background:var(--surface-strong)}
    .receipt-review-field{display:grid;gap:4px;min-width:0}.receipt-review-field>span{color:var(--muted);font-size:8px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.receipt-review-field input,.receipt-review-field select{min-width:0;width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;color:var(--ink);background:var(--surface)}
    .receipt-review-name small{overflow:hidden;color:var(--muted);font-size:9px;text-overflow:ellipsis;white-space:nowrap}.receipt-review-status{grid-column:1/-1;color:var(--muted);font-size:9px}.receipt-review-status.warning{color:#9b5b13;font-weight:800}.receipt-review-row.invalid{border-color:#b45e46}
    @media(max-width:900px){.receipt-review-row{grid-template-columns:1fr 1fr 90px 76px}.receipt-review-field.match{grid-column:1/-1}}
    @media(max-width:620px){.receipt-review-row{grid-template-columns:1fr 1fr}.receipt-review-field.name,.receipt-review-field.match{grid-column:1/-1}}
  `;
  documentRef.head.append(style);
}

function language(documentRef) {
  return documentRef.documentElement.lang || "en";
}

export function installReceiptPurchaseUi(documentRef = document) {
  const form = documentRef.querySelector("#purchase-batch-form");
  const textarea = documentRef.querySelector("#purchase-batch-text");
  const errorPanel = documentRef.querySelector("#purchase-batch-error");
  const submit = documentRef.querySelector("#purchase-batch-submit");
  const listLabel = textarea?.closest("label");
  if (!form || !textarea || !errorPanel || !submit || !listLabel) return;
  installStyles(documentRef);

  const review = documentRef.createElement("div");
  review.id = "purchase-receipt-review";
  review.className = "receipt-review";
  review.hidden = true;
  review.innerHTML = `<div class="receipt-review-heading"><strong></strong><small></small></div><div class="receipt-review-list"></div>`;
  listLabel.after(review);

  let originalText = "";
  let reviewing = false;

  function localize() {
    const t = strings(language(documentRef));
    const intro = documentRef.querySelector("#purchase-batch-intro");
    if (intro && intro.textContent !== t.intro) intro.textContent = t.intro;
    if (textarea.placeholder !== t.placeholder) textarea.placeholder = t.placeholder;
    if (!reviewing) submit.textContent = t.parse;
    review.querySelector("strong").textContent = t.reviewTitle;
    review.querySelector("small").textContent = t.reviewIntro;
  }

  function optionHtml(options, selectedValue) {
    const t = strings(language(documentRef));
    return [
      `<option value="">${escapeHtml(t.newItem)}</option>`,
      ...options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${escapeHtml(option.name)}</option>`),
    ].join("");
  }

  function renderReview(entries, options) {
    const t = strings(language(documentRef));
    review.querySelector(".receipt-review-list").innerHTML = entries.map((entry, index) => `
      <div class="receipt-review-row" data-receipt-row="${index}">
        <label class="receipt-review-field name receipt-review-name"><span>${escapeHtml(t.receiptItem)}</span><input data-receipt-name value="${escapeHtml(entry.label)}"><small title="${escapeHtml(entry.category)}">${escapeHtml(entry.category || "—")}</small></label>
        <label class="receipt-review-field match"><span>${escapeHtml(t.catalogue)}</span><select data-receipt-match>${optionHtml(options, entry.suggested?.value || "")}</select></label>
        <label class="receipt-review-field"><span>${escapeHtml(t.quantity)}</span><input data-receipt-quantity type="number" min="0.000000001" step="any" value="${escapeHtml(cleanNumber(entry.quantity))}"></label>
        <label class="receipt-review-field"><span>${escapeHtml(t.unit)}</span><input data-receipt-unit value="${escapeHtml(entry.unit)}"></label>
        <label class="receipt-review-field"><span>${escapeHtml(t.paid)}</span><input data-receipt-price type="number" min="0" step="any" value="${escapeHtml(cleanNumber(entry.totalPrice))}"></label>
        <label class="receipt-review-field kind"><span>${escapeHtml(t.kind)}</span><select data-receipt-kind><option value="food" ${entry.kind === "food" ? "selected" : ""}>${escapeHtml(t.food)}</option><option value="household" ${entry.kind === "household" ? "selected" : ""}>${escapeHtml(t.household)}</option></select></label>
        <div class="receipt-review-status ${entry.weightNeeded ? "warning" : ""}" data-receipt-status>${escapeHtml(entry.weightNeeded ? t.weightNeeded : entry.suggested ? t.matched : t.new)}</div>
      </div>
    `).join("");
    review.hidden = false;
    reviewing = true;
    submit.textContent = t.apply;
  }

  function validateAndSerialize() {
    const t = strings(language(documentRef));
    const options = new Map(catalogueFromDocument(documentRef).map((option) => [option.value, option]));
    const lines = [];
    let valid = true;
    review.querySelectorAll("[data-receipt-row]").forEach((row) => {
      row.classList.remove("invalid");
      const name = row.querySelector("[data-receipt-name]").value.trim();
      const match = row.querySelector("[data-receipt-match]").value;
      const quantity = Number(row.querySelector("[data-receipt-quantity]").value);
      const unit = row.querySelector("[data-receipt-unit]").value.trim();
      const price = Number(row.querySelector("[data-receipt-price]").value);
      const kind = row.querySelector("[data-receipt-kind]").value;
      const status = row.querySelector("[data-receipt-status]");
      status.classList.remove("warning");
      if (!name || !Number.isFinite(quantity) || quantity <= 0 || !unit || !Number.isFinite(price) || price < 0) {
        row.classList.add("invalid");
        status.textContent = t.invalidRow;
        status.classList.add("warning");
        valid = false;
        return;
      }
      if (!match && kind === "food" && !["g", "kg"].includes(normalizeName(unit))) {
        row.classList.add("invalid");
        status.textContent = t.foodWeight;
        status.classList.add("warning");
        valid = false;
        return;
      }
      const selected = options.get(match);
      const fields = [selected?.name || name, cleanNumber(quantity), unit, cleanNumber(price)];
      if (!selected) fields.push(kind);
      lines.push(fields.join(";"));
    });
    return valid ? lines.join("\n") : "";
  }

  function resetReview() {
    review.hidden = true;
    review.querySelector(".receipt-review-list").innerHTML = "";
    reviewing = false;
    originalText = "";
    localize();
  }

  form.addEventListener("submit", (event) => {
    if (!reviewing) {
      if (looksLikeStructuredPurchase(textarea.value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      errorPanel.textContent = "";
      try {
        originalText = textarea.value;
        const options = catalogueFromDocument(documentRef);
        renderReview(parseSupermarketReceipt(originalText, options), options);
      } catch (error) {
        errorPanel.textContent = error?.message || String(error);
      }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    errorPanel.textContent = "";
    const structured = validateAndSerialize();
    if (!structured) return;
    textarea.value = structured;
    reviewing = false;
    submit.textContent = strings(language(documentRef)).parse;

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    setTimeout(() => {
      if (!textarea.value) resetReview();
      else {
        reviewing = true;
        textarea.value = originalText;
        submit.textContent = strings(language(documentRef)).apply;
      }
    }, 0);
  }, true);

  textarea.addEventListener("input", () => {
    if (reviewing && textarea.value !== originalText) resetReview();
  });
  textarea.addEventListener("focus", localize);
  documentRef.querySelector("#language-select")?.addEventListener("change", () => setTimeout(localize, 0));

  const intro = documentRef.querySelector("#purchase-batch-intro");
  if (intro) {
    new MutationObserver(localize).observe(intro, { childList: true, characterData: true, subtree: true });
  }
  new MutationObserver(localize).observe(textarea, { attributes: true, attributeFilter: ["placeholder"] });
  localize();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => installReceiptPurchaseUi(document), { once: true });
  } else {
    installReceiptPurchaseUi(document);
  }
}
