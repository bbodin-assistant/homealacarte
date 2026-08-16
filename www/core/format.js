import { escapeHtml } from "./dom.js?v=homealacarte-77";

export { escapeHtml } from "./dom.js?v=homealacarte-77";

export function externalHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function formatInputNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

export const displayCategory = (value) => String(value || "").replaceAll("::", " › ");
export const normalizedCategory = (value) => String(value || "").replace(/\s*›\s*/g, "::");

export function options(values, selected) {
  return values.map((value) =>
    `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`,
  ).join("");
}

export function createFormatters(getLanguage, translate) {
  const locale = () => {
    try {
      return Intl.getCanonicalLocales(String(getLanguage() || ""))[0];
    } catch {
      return undefined;
    }
  };
  const formatNumber = (value, digits = 1) => new Intl.NumberFormat(
    locale(),
    { maximumFractionDigits: digits },
  ).format(value || 0);
  const formatMoney = (value) => new Intl.NumberFormat(
    locale(),
    { style: "currency", currency: "EUR" },
  ).format(value || 0);
  const formatBytes = (value) => {
    const bytes = Number(value || 0);
    if (!bytes) return `0 ${translate("bytes")}`;
    const units = ["bytes", "kilobytes", "megabytes"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${formatNumber(bytes / (1024 ** index), index ? 1 : 0)} ${translate(units[index])}`;
  };
  const formatDateTime = (value) => {
    if (!value) return translate("never");
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
      ? translate("unknown")
      : new Intl.DateTimeFormat(locale(), {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
  };
  const translatedTemplate = (key, values = {}) => Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    translate(key),
  );
  return { formatBytes, formatDateTime, formatMoney, formatNumber, translatedTemplate };
}
