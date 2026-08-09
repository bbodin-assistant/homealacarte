export function createSearchableSelect({
  getLanguage,
  translate,
  escapeHtml,
  documentRef = document,
  EventClass = Event,
}) {
  function inputFor(select) {
    return select?.closest(".searchable-select")?.querySelector(".searchable-select-input") || null;
  }

  function enhance(select, placeholder = "", requiredOverride = null, allowCustom = false) {
    if (!select) return null;
    const required = requiredOverride == null
      ? (select.required || select.dataset.wasRequired === "true")
      : Boolean(requiredOverride);
    let wrapper = select.closest(".searchable-select");
    let input = inputFor(select);
    if (!wrapper) {
      wrapper = documentRef.createElement("div");
      wrapper.className = "searchable-select";
      select.before(wrapper);
      wrapper.append(select);
      input = documentRef.createElement("input");
      input.type = "search";
      input.className = "searchable-select-input";
      input.autocomplete = "off";
      const list = documentRef.createElement("datalist");
      list.id = `searchable-select-${Math.random().toString(36).slice(2)}`;
      input.setAttribute("list", list.id);
      wrapper.prepend(input);
      wrapper.append(list);
      select.classList.add("searchable-select-source");
      input.addEventListener("input", () => {
        const language = getLanguage();
        const query = input.value.trim().toLocaleLowerCase(language);
        const customAllowed = input.dataset.allowCustom === "true";
        const choices = [...select.options].filter((option) => option.value);
        const exact = choices.find((option) => option.textContent.trim()
          .toLocaleLowerCase(language) === query);
        const startsWith = choices.filter((option) => option.textContent.trim()
          .toLocaleLowerCase(language).startsWith(query));
        const match = exact
          || (!customAllowed && query && startsWith.length === 1 ? startsWith[0] : null);
        const nextValue = match?.value || "";
        if (select.value !== nextValue) {
          select.value = nextValue;
          select.dispatchEvent(new EventClass("change", { bubbles: true }));
        }
        input.setCustomValidity((customAllowed && query)
          || nextValue
          || input.dataset.required !== "true"
          ? ""
          : translate("select_catalogue_suggestion"));
      });
      input.addEventListener("change", () => input.dispatchEvent(new EventClass("input")));
    }
    select.dataset.wasRequired = String(required);
    select.required = false;
    input.placeholder = placeholder;
    input.dataset.required = String(required);
    input.dataset.allowCustom = String(allowCustom);
    input.required = required;
    const list = wrapper.querySelector("datalist");
    list.innerHTML = [...select.options]
      .filter((option) => option.value)
      .map((option) => `<option value="${escapeHtml(option.textContent.trim())}"></option>`)
      .join("");
    const selected = select.selectedOptions[0];
    input.value = selected?.value ? selected.textContent.trim() : "";
    input.setCustomValidity("");
    return input;
  }

  function setHidden(select, hidden) {
    const wrapper = select?.closest(".searchable-select");
    if (wrapper) {
      wrapper.hidden = hidden;
      const input = inputFor(select);
      if (input) input.disabled = hidden;
    } else if (select) select.hidden = hidden;
  }

  return { enhance, inputFor, setHidden };
}
