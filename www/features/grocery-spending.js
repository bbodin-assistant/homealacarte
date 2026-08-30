import { collectPurchaseHistory } from "../core/purchases.js?v=homealacarte-110";

const STRINGS = {
  en: {
    tab: "Spending",
    eyebrow: "Purchase insights",
    title: "Grocery spending analysis",
    intro: "Track recorded grocery spending over time and see where the budget goes.",
    thisWeek: "This week",
    thisMonth: "This month",
    recordedSpend: "Recorded spend",
    purchaseLines: "Purchase lines",
    weekly: "Weekly spending",
    weeklyIntro: "Last 8 weeks",
    monthly: "Monthly spending",
    monthlyIntro: "Last 6 months",
    categories: "Spending by category",
    categoriesIntro: "This month",
    stores: "Spending by store",
    storesIntro: "This month",
    frequent: "Frequently purchased products",
    frequentIntro: "Across recorded purchase history",
    product: "Product",
    purchases: "Purchases",
    spend: "Spend",
    noPurchases: "No recorded purchases yet.",
    noPeriodPurchases: "No purchases recorded for this period.",
    unknownCategory: "Uncategorized",
    unknownStore: "Store not specified",
  },
  fr: {
    tab: "Dépenses",
    eyebrow: "Analyse des achats",
    title: "Analyse des dépenses de courses",
    intro: "Suivez les dépenses de courses enregistrées dans le temps et leur répartition.",
    thisWeek: "Cette semaine",
    thisMonth: "Ce mois-ci",
    recordedSpend: "Dépenses enregistrées",
    purchaseLines: "Lignes d’achat",
    weekly: "Dépenses hebdomadaires",
    weeklyIntro: "8 dernières semaines",
    monthly: "Dépenses mensuelles",
    monthlyIntro: "6 derniers mois",
    categories: "Dépenses par catégorie",
    categoriesIntro: "Ce mois-ci",
    stores: "Dépenses par magasin",
    storesIntro: "Ce mois-ci",
    frequent: "Produits achetés fréquemment",
    frequentIntro: "Sur l’historique des achats enregistrés",
    product: "Produit",
    purchases: "Achats",
    spend: "Dépenses",
    noPurchases: "Aucun achat enregistré pour le moment.",
    noPeriodPurchases: "Aucun achat enregistré sur cette période.",
    unknownCategory: "Sans catégorie",
    unknownStore: "Magasin non renseigné",
  },
};

function stringsFor(language) {
  const requested = String(language || "").toLowerCase();
  return STRINGS[requested] || STRINGS[requested.split("-")[0]] || STRINGS.en;
}

function dateKey(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mondayStart(date) {
  const day = date.getUTCDay();
  return addUtcDays(date, -(day === 0 ? 6 : day - 1));
}

function monthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function sum(rows) {
  return rows.reduce((total, row) => total + row.totalPrice, 0);
}

function aggregate(rows, keyFor) {
  const totals = new Map();
  rows.forEach((row) => {
    const key = keyFor(row);
    const current = totals.get(key) || { key, spend: 0, count: 0 };
    current.spend += row.totalPrice;
    current.count += 1;
    totals.set(key, current);
  });
  return [...totals.values()].sort((left, right) => (
    right.spend - left.spend || right.count - left.count || left.key.localeCompare(right.key)
  ));
}

function catalogueCategoryMap(snapshot, fallback) {
  const map = new Map();
  [...(snapshot?.ingredients || []), ...(snapshot?.household_items || [])].forEach((item) => {
    map.set(String(item?.key || ""), String(item?.category || "").trim() || fallback);
  });
  return map;
}

function purchaseRecords(snapshot, language) {
  const strings = stringsFor(language);
  const categories = catalogueCategoryMap(snapshot, strings.unknownCategory);
  return collectPurchaseHistory(snapshot)
    .filter((row) => row?.purchase && Number.isFinite(Number(row.purchase.totalPrice)))
    .map((row) => ({
      date: String(row.date || ""),
      itemKey: String(row.itemKey || ""),
      itemName: String(row.itemName || ""),
      category: categories.get(String(row.itemKey || "")) || strings.unknownCategory,
      store: String(row.purchase.store || "").trim() || strings.unknownStore,
      totalPrice: Math.max(0, Number(row.purchase.totalPrice)),
    }));
}

export function buildSpendingAnalysis(snapshot, referenceDate = new Date(), language = "en") {
  const strings = stringsFor(language);
  const records = purchaseRecords(snapshot, language);
  const today = parseDateKey(dateKey(referenceDate));
  const weekStart = mondayStart(today);
  const nextWeek = addUtcDays(weekStart, 7);
  const currentMonth = monthStart(today);
  const nextMonth = addUtcMonths(currentMonth, 1);
  const dated = records.map((row) => ({ ...row, parsedDate: parseDateKey(row.date) }))
    .filter((row) => row.parsedDate);
  const inRange = (row, start, end) => row.parsedDate >= start && row.parsedDate < end;
  const currentWeekRows = dated.filter((row) => inRange(row, weekStart, nextWeek));
  const currentMonthRows = dated.filter((row) => inRange(row, currentMonth, nextMonth));

  const weekly = [];
  for (let offset = -7; offset <= 0; offset += 1) {
    const start = addUtcDays(weekStart, offset * 7);
    const end = addUtcDays(start, 7);
    weekly.push({ start: isoDate(start), spend: sum(dated.filter((row) => inRange(row, start, end))) });
  }

  const monthly = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    const start = addUtcMonths(currentMonth, offset);
    const end = addUtcMonths(start, 1);
    monthly.push({ start: isoDate(start), spend: sum(dated.filter((row) => inRange(row, start, end))) });
  }

  return {
    currentWeek: sum(currentWeekRows),
    currentMonth: sum(currentMonthRows),
    totalRecorded: sum(records),
    purchaseCount: records.length,
    weekly,
    monthly,
    byCategory: aggregate(currentMonthRows, (row) => row.category),
    byStore: aggregate(currentMonthRows, (row) => row.store),
    frequentProducts: aggregate(records, (row) => row.itemName).sort((left, right) => (
      right.count - left.count || right.spend - left.spend || left.key.localeCompare(right.key)
    )),
    strings,
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatMoney(value, language) {
  return new Intl.NumberFormat(language || undefined, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatWeek(start, language) {
  const date = parseDateKey(start);
  return new Intl.DateTimeFormat(language || undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatMonth(start, language) {
  const date = parseDateKey(start);
  return new Intl.DateTimeFormat(language || undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function barRows(rows, language, labelFor) {
  const maximum = Math.max(0, ...rows.map((row) => row.spend));
  return rows.map((row) => {
    const width = maximum > 0 ? row.spend / maximum * 100 : 0;
    return `<div class="spending-bar-row">
      <span>${escapeHtml(labelFor(row.start, language))}</span>
      <div class="spending-bar-track"><i style="width:${width.toFixed(2)}%"></i></div>
      <strong>${escapeHtml(formatMoney(row.spend, language))}</strong>
    </div>`;
  }).join("");
}

function breakdownRows(rows, language, emptyLabel) {
  if (!rows.length) return `<p class="spending-empty">${escapeHtml(emptyLabel)}</p>`;
  const total = rows.reduce((value, row) => value + row.spend, 0);
  return rows.map((row) => {
    const width = total > 0 ? row.spend / total * 100 : 0;
    return `<div class="spending-breakdown-row">
      <div><strong>${escapeHtml(row.key)}</strong><span>${row.count}</span></div>
      <div class="spending-breakdown-track"><i style="width:${width.toFixed(2)}%"></i></div>
      <strong>${escapeHtml(formatMoney(row.spend, language))}</strong>
    </div>`;
  }).join("");
}

function frequentRows(rows, language, strings) {
  if (!rows.length) return `<p class="spending-empty">${escapeHtml(strings.noPurchases)}</p>`;
  return `<div class="spending-products-head" aria-hidden="true">
    <span>${escapeHtml(strings.product)}</span><span>${escapeHtml(strings.purchases)}</span><span>${escapeHtml(strings.spend)}</span>
  </div>${rows.slice(0, 10).map((row) => `<div class="spending-product-row">
    <strong>${escapeHtml(row.key)}</strong>
    <span>${row.count}</span>
    <span>${escapeHtml(formatMoney(row.spend, language))}</span>
  </div>`).join("")}`;
}

function renderPanel(panel, state) {
  const language = state?.language || document.documentElement.lang || "en";
  const analysis = buildSpendingAnalysis(state?.snapshot, new Date(), language);
  const strings = analysis.strings;
  const tabLabel = document.querySelector("#grocery-spending-tab-label");
  if (tabLabel) tabLabel.textContent = strings.tab;
  panel.innerHTML = `<div class="page-heading spending-heading">
    <div>
      <p class="eyebrow">${escapeHtml(strings.eyebrow)}</p>
      <h1>${escapeHtml(strings.title)}</h1>
      <p class="spending-intro">${escapeHtml(strings.intro)}</p>
    </div>
  </div>
  <div class="spending-summary-grid">
    <article class="spending-stat"><span>${escapeHtml(strings.thisWeek)}</span><strong>${escapeHtml(formatMoney(analysis.currentWeek, language))}</strong></article>
    <article class="spending-stat"><span>${escapeHtml(strings.thisMonth)}</span><strong>${escapeHtml(formatMoney(analysis.currentMonth, language))}</strong></article>
    <article class="spending-stat"><span>${escapeHtml(strings.recordedSpend)}</span><strong>${escapeHtml(formatMoney(analysis.totalRecorded, language))}</strong></article>
    <article class="spending-stat"><span>${escapeHtml(strings.purchaseLines)}</span><strong>${analysis.purchaseCount}</strong></article>
  </div>
  <div class="spending-analysis-grid spending-trend-grid">
    <section class="panel spending-card">
      <header><div><h2>${escapeHtml(strings.weekly)}</h2><p>${escapeHtml(strings.weeklyIntro)}</p></div></header>
      <div class="spending-bars">${barRows(analysis.weekly, language, formatWeek)}</div>
    </section>
    <section class="panel spending-card">
      <header><div><h2>${escapeHtml(strings.monthly)}</h2><p>${escapeHtml(strings.monthlyIntro)}</p></div></header>
      <div class="spending-bars">${barRows(analysis.monthly, language, formatMonth)}</div>
    </section>
  </div>
  <div class="spending-analysis-grid">
    <section class="panel spending-card">
      <header><div><h2>${escapeHtml(strings.categories)}</h2><p>${escapeHtml(strings.categoriesIntro)}</p></div></header>
      <div class="spending-breakdown">${breakdownRows(analysis.byCategory, language, strings.noPeriodPurchases)}</div>
    </section>
    <section class="panel spending-card">
      <header><div><h2>${escapeHtml(strings.stores)}</h2><p>${escapeHtml(strings.storesIntro)}</p></div></header>
      <div class="spending-breakdown">${breakdownRows(analysis.byStore, language, strings.noPeriodPurchases)}</div>
    </section>
  </div>
  <section class="panel spending-card spending-products-card">
    <header><div><h2>${escapeHtml(strings.frequent)}</h2><p>${escapeHtml(strings.frequentIntro)}</p></div></header>
    <div class="spending-products">${frequentRows(analysis.frequentProducts, language, strings)}</div>
  </section>`;
}

function createUi() {
  const switcher = document.querySelector(".grocery-mode-switch");
  const groceryView = document.querySelector("#grocery-view");
  if (!switcher || !groceryView) return null;

  let button = document.querySelector("#grocery-spending-tab");
  if (!button) {
    button = document.createElement("button");
    button.id = "grocery-spending-tab";
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.innerHTML = '<span id="grocery-spending-tab-label">Spending</span>';
    switcher.append(button);
  }

  let panel = document.querySelector("#grocery-spending-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "grocery-spending-panel";
    panel.className = "grocery-subview spending-analysis-subview";
    panel.hidden = true;
    groceryView.append(panel);
  }
  return { button, panel };
}

export function mountGrocerySpendingAnalysis() {
  const ui = createUi();
  if (!ui) return;
  const { button, panel } = ui;
  let active = false;

  const deactivate = () => {
    active = false;
    button.classList.remove("active");
    button.setAttribute("aria-selected", "false");
    panel.classList.remove("active");
    panel.hidden = true;
  };

  const enforce = () => {
    if (!active) return;
    document.querySelectorAll("[data-grocery-mode]").forEach((tab) => {
      tab.classList.remove("active");
      tab.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll("[data-grocery-panel]").forEach((candidate) => {
      candidate.classList.remove("active");
      if (!candidate.hidden) candidate.hidden = true;
    });
    button.classList.add("active");
    button.setAttribute("aria-selected", "true");
    panel.hidden = false;
    panel.classList.add("active");
  };

  const activate = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    active = true;
    renderPanel(panel, globalThis.homealacarteState);
    enforce();
  };

  button.addEventListener("click", activate);
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-grocery-mode], [data-tab]")) deactivate();
  });

  const purchaseList = document.querySelector("#purchase-list");
  if (purchaseList && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => {
      if (!active) return;
      renderPanel(panel, globalThis.homealacarteState);
      enforce();
    }).observe(purchaseList, { childList: true, subtree: true });
  }

  const languageSelect = document.querySelector("#language-select");
  languageSelect?.addEventListener("change", () => {
    if (!active) return;
    queueMicrotask(() => {
      renderPanel(panel, globalThis.homealacarteState);
      enforce();
    });
  });
}

if (typeof document !== "undefined") {
  mountGrocerySpendingAnalysis();
}
