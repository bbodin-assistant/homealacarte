export function createWorkerResponseHandler({
  state,
  select,
  translate,
  setBusy,
  showError,
  clearError,
  downloadText,
  downloadBytes,
  buildZip,
  documentRef,
  urlApi,
  BlobClass,
  persistDraft,
  render,
  renderAutoMenuResult,
  send,
}) {
  return async function handleWorkerMessage(data) {
    if (typeof data.serializedData === "string") state.serializedData = data.serializedData;
    if (data.type === "status") {
      setBusy(true, data.code ? translate(data.code) : data.message);
      return;
    }
    if (data.type === "error") {
      state.nonPersistingRequestIds?.delete(data.requestId);
      if (state.pendingDataAction?.requestId === data.requestId) state.pendingDataAction = null;
      showError(data.message, data.code);
      return;
    }
    if (data.type === "export-ready") {
      downloadText(data.filename, data.content);
      if (data.snapshot) {
        state.snapshot = data.snapshot;
        state.familyDraft = structuredClone(data.snapshot.people);
        state.draft = structuredClone(data.snapshot.planner);
        state.stockDraft = structuredClone(data.snapshot.stock);
        state.customDraft = structuredClone(data.snapshot.custom_grocery);
        persistDraft();
        render();
      }
      setBusy(false);
      return;
    }
    if (data.type === "folder-export-ready") {
      try {
        downloadBytes(
          "homealacarte_data.zip",
          buildZip(data.files),
          "application/zip",
        );
        if (data.snapshot) {
          state.snapshot = data.snapshot;
          state.familyDraft = structuredClone(data.snapshot.people);
          state.draft = structuredClone(data.snapshot.planner);
          state.stockDraft = structuredClone(data.snapshot.stock);
          state.customDraft = structuredClone(data.snapshot.custom_grocery);
          persistDraft();
          render();
        }
        setBusy(false, translate("folder_exported"));
      } catch (error) {
        showError(error?.message || String(error));
      }
      return;
    }
    if (data.type === "pdf-ready") {
      const url = urlApi.createObjectURL(new BlobClass([data.bytes], { type: "application/pdf" }));
      const link = documentRef.createElement("a");
      link.href = url;
      link.download = data.filename;
      link.click();
      setTimeout(() => urlApi.revokeObjectURL(url), 1000);
      if (data.snapshot) {
        state.snapshot = data.snapshot;
        state.familyDraft = structuredClone(data.snapshot.people);
        state.draft = structuredClone(data.snapshot.planner);
        state.stockDraft = structuredClone(data.snapshot.stock);
        state.customDraft = structuredClone(data.snapshot.custom_grocery);
        persistDraft();
        render();
      }
      setBusy(false);
      return;
    }
    if (data.type === "menu-generated") {
      clearError();
      state.autoMenuProposal = data.proposal;
      renderAutoMenuResult();
      setBusy(false);
      return;
    }
    if (data.snapshot) {
      const suppressPersistence = state.nonPersistingRequestIds?.delete(data.requestId) === true;
      clearError();
      state.snapshot = data.snapshot;
      state.language = data.snapshot.language;
      state.familyDraft = structuredClone(data.snapshot.people);
      state.draft = structuredClone(data.snapshot.planner);
      state.stockDraft = structuredClone(data.snapshot.stock);
      state.customDraft = structuredClone(data.snapshot.custom_grocery);
      if (data.source) state.source = data.source;
      if (state.restorePeople) {
        const bundledPeople = new Map(
          state.snapshot.people.map((person) => [person.key, person]),
        );
        const rows = state.restorePeople.map((person) => ({
          ...person,
          description: person.description
            || bundledPeople.get(person.key)?.description
            || "",
        }));
        state.restorePeople = null;
        send("replace-people", { rows });
        return;
      }
      if (state.restoreMenu) {
        const rows = state.restoreMenu;
        state.restoreMenu = null;
        send("replace-menu", { rows });
        return;
      }
      if (state.restoreStock) {
        const rows = state.restoreStock;
        state.restoreStock = null;
        send("replace-stock", { rows });
        return;
      }
      if (state.restoreCustom) {
        const rows = state.restoreCustom;
        state.restoreCustom = null;
        send("replace-custom-grocery", { rows });
        return;
      }
      if (!suppressPersistence) persistDraft();
      render();
      setBusy(false);
      if (state.pendingDataAction?.requestId === data.requestId) {
        const message = select("#data-action-message");
        message.classList.remove("warning");
        message.textContent = translate(state.pendingDataAction.messageKey);
        state.pendingDataAction = null;
      }
    }
  }
}
