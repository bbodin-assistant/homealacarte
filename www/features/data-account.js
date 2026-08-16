export function createDataAccountFeature({
  state,
  select,
  selectAll,
  documentRef,
  storage,
  translate,
  translatedTemplate,
  localizeError,
  externalHttpUrl,
  formatBytes,
  formatDateTime,
  getStorageStatus,
  getStorageDiagnostics,
  getPrivateStateCopy,
  loadPrivacyRequests,
  deletePrivateData,
  resolveSyncConflict,
  signIn,
  signOut,
  signUp,
  submitPrivacyRequest,
  synchronizePrivateState,
  downloadText,
  stockPayload,
  customGroceryPayload,
  send,
  showError,
  openConfirmation,
  switchTab,
  applyColorTheme,
  applyTranslations,
  reloadPage,
  storagePrefix,
  emptyDatabaseContent,
}) {
  function storageStatusKey(statusName) {
    return {
      local: "sync_local",
      "signed-out": "sync_signed_out",
      connecting: "sync_connecting",
      saving: "sync_saving",
      synced: "sync_synced",
      offline: "sync_offline",
      conflict: "sync_conflict",
      error: "sync_error",
    }[statusName] || "sync_local";
  }

  function storageStatusDetailKey(statusName) {
    return {
      local: "sync_local_detail",
      "signed-out": "sync_signed_out_detail",
      connecting: "sync_connecting_detail",
      saving: "sync_saving_detail",
      synced: "sync_synced_detail",
      offline: "sync_offline_detail",
      conflict: "sync_conflict_detail",
      error: "sync_error_detail",
    }[statusName] || "sync_local_detail";
  }

  function displayedStorageStatus(status = state.storageStatus || getStorageStatus()) {
    if (!state.lastError) return status;
    return {
      ...status,
      state: "error",
      message: localizeError(state.lastError.message, state.lastError.code),
    };
  }

  function renderStorageStatus(status = getStorageStatus()) {
    state.storageStatus = status;
    const displayed = displayedStorageStatus(status);
    const label = translate(storageStatusKey(displayed.state));
    const source = select("#source-status");
    if (!source) return;
    renderHeaderStatus();
    select(".account-current-status").className = `account-current-status sync-${displayed.state}`;
    select("#account-status-label").textContent = label;
    select("#account-status-detail").textContent = displayed.message === "confirmation_required"
      ? translate("confirmation_required")
      : displayed.message || translate(storageStatusDetailKey(displayed.state));
    const signedIn = Boolean(status.email) && status.state !== "signed-out";
    select("#account-signed-out").hidden = signedIn;
    select("#account-signed-in").hidden = !signedIn;
    select("#account-email-label").textContent = status.email || "";
    select("#account-conflict").hidden = status.state !== "conflict";
    const privacySignedIn = Boolean(status.email) && status.state !== "signed-out";
    select("#privacy-request-signed-out").hidden = privacySignedIn;
    select("#privacy-request-signed-in").hidden = !privacySignedIn;
    if (!privacySignedIn) {
      state.privacyRequests = [];
      state.privacyRequestsUserId = "";
    }
    if (state.activeTab === "data") renderDataOverview();
  }

  function privacyRequestTypeLabel(requestType) {
    return translate(`privacy_type_${requestType}`);
  }

  function privacyRequestStatusLabel(status) {
    return translate(`privacy_status_${status}`);
  }

  function renderPrivacyRequestList() {
    const list = select("#privacy-request-list");
    list.replaceChildren();
    if (!state.privacyRequests.length) {
      const empty = documentRef.createElement("p");
      empty.className = "privacy-request-empty";
      empty.textContent = translate("privacy_request_none");
      list.append(empty);
      return;
    }
    state.privacyRequests.forEach((request) => {
      const row = documentRef.createElement("article");
      row.className = "privacy-request-row";
      const heading = documentRef.createElement("strong");
      heading.textContent = privacyRequestTypeLabel(request.request_type);
      const date = documentRef.createElement("time");
      date.dateTime = request.created_at;
      date.textContent = formatDateTime(request.created_at);
      const status = documentRef.createElement("span");
      status.className = `privacy-request-status ${String(request.status).replaceAll("_", "-")}`;
      status.textContent = privacyRequestStatusLabel(request.status);
      const message = documentRef.createElement("p");
      message.textContent = request.message;
      row.append(heading, date, status, message);
      if (request.response_message) {
        const response = documentRef.createElement("p");
        response.className = "privacy-request-response";
        response.textContent = translatedTemplate("privacy_request_response", {
          response: request.response_message,
        });
        row.append(response);
      }
      list.append(row);
    });
  }

  async function refreshPrivacyRequests(force = false) {
    const userId = state.storageStatus?.email && state.storageStatus.state !== "signed-out"
      ? (await getStorageDiagnostics()).userId
      : "";
    if (!userId) {
      state.privacyRequests = [];
      state.privacyRequestsUserId = "";
      renderPrivacyRequestList();
      return;
    }
    if (!force && state.privacyRequestsUserId === userId) {
      renderPrivacyRequestList();
      return;
    }
    if (state.privacyRequestsLoading) return;
    state.privacyRequestsLoading = true;
    try {
      state.privacyRequests = await loadPrivacyRequests();
      state.privacyRequestsUserId = userId;
      renderPrivacyRequestList();
    } catch (error) {
      const feedback = select("#privacy-request-feedback");
      feedback.classList.add("error");
      feedback.textContent = localizeError(error?.message || String(error), error?.code);
    } finally {
      state.privacyRequestsLoading = false;
    }
  }

  async function renderDataOverview() {
    if (!select("#data-overview-title")) return;
    try {
      const diagnostics = await getStorageDiagnostics();
      select("#data-account-email").textContent = diagnostics.email || translate("not_signed_in");
      select("#data-account-id").textContent = diagnostics.userId || "—";
      select("#data-local-size").textContent = formatBytes(diagnostics.localBytes);
      select("#data-local-date").textContent = diagnostics.localUpdatedAt
        ? translatedTemplate("updated_at", { date: formatDateTime(diagnostics.localUpdatedAt) })
        : translate("no_saved_copy");
      select("#data-online-size").textContent = diagnostics.remoteError
        ? translate("unavailable")
        : diagnostics.email
          ? formatBytes(diagnostics.remoteBytes)
          : translate("not_signed_in");
      select("#data-online-date").textContent = diagnostics.remoteError
        || (diagnostics.remoteUpdatedAt
          ? translatedTemplate("updated_at", { date: formatDateTime(diagnostics.remoteUpdatedAt) })
          : translate("no_online_copy"));
      const controllerLink = select("#about-controller-contact");
      controllerLink.textContent = diagnostics.controllerName
        || translate("controller_not_configured");
      const contactUrl = externalHttpUrl(diagnostics.privacyContact);
      if (contactUrl) {
        controllerLink.href = contactUrl;
      } else if (diagnostics.privacyContact.includes("@")) {
        controllerLink.href = `mailto:${diagnostics.privacyContact}`;
      } else {
        controllerLink.removeAttribute("href");
      }
      await refreshPrivacyRequests();
    } catch (error) {
      select("#data-online-size").textContent = translate("unavailable");
      select("#data-online-date").textContent = localizeError(error?.message || String(error));
    }
  }

  function renderHeaderStatus() {
    const source = select("#source-status");
    if (!source) return;
    if (state.engineBusy) {
      source.className = "source-badge sync-saving engine-busy";
      select("#source-label").textContent = state.engineMessage || translate("loading");
      return;
    }
    const status = displayedStorageStatus();
    source.className = `source-badge sync-${status.state}`;
    select("#source-label").textContent = state.lastError
      ? translate("data_error")
      : translate(storageStatusKey(status.state));
  }

  function openAccountSection() {
    switchTab("data");
    renderStorageStatus(state.storageStatus);
    select("#account-message").textContent = "";
    requestAnimationFrame(() => {
      select("#account-section").scrollIntoView({ behavior: "smooth", block: "start" });
      select("#account-section").focus({ preventScroll: true });
    });
  }

  function openAboutDialog() {
    renderDataOverview();
    const dialog = select("#about-dialog");
    if (!dialog.open) dialog.showModal();
  }

  function closeAboutDialog() {
    select("#about-dialog").close();
  }

  function setAccountBusy(busy) {
    selectAll("#account-section button, #account-section input").forEach((control) => {
      control.disabled = busy;
    });
  }

  function accountError(error) {
    select("#account-message").textContent = translatedTemplate("auth_failed", {
      message: localizeError(error?.message || String(error)),
    });
  }

  async function downloadData() {
    if (state.lastError || !state.snapshot) {
      const stored = await getPrivateStateCopy();
      if (stored !== undefined) {
        const source = stored?.sources?.length === 1 ? stored.sources[0] : null;
        downloadText(
          source?.path?.toLowerCase().endsWith(".json") ? source.path : "homealacarte_private_state.json",
          typeof source?.content === "string" ? source.content : JSON.stringify(stored, null, 2),
        );
        return;
      }
    }
    clearTimeout(state.editTimer);
    clearTimeout(state.stockTimer);
    clearTimeout(state.customTimer);
    send("export-data", {
      kind: "consolidated",
      rows: state.draft,
      stock: stockPayload(),
      customGrocery: customGroceryPayload(),
    });
  }

  function clearClientPreferences() {
    Object.keys(storage)
      .filter((key) => key.startsWith(storagePrefix))
      .forEach((key) => storage.removeItem(key));
    state.language = state.language || "";
    state.groceryMode = "list";
    state.menuSelectedOnly = false;
    state.groceryHideStocked = false;
    state.colorTheme = 0;
    state.randomThemes = [];
    state.dishRangeSignature = "";
    state.source = "deleted";
    state.importedSources = null;
    state.serializedData = null;
    state.restorePeople = null;
    state.restoreMenu = null;
    state.restoreStock = null;
    state.restoreCustom = null;
    applyColorTheme(0);
    applyTranslations();
  }

  function emptyAllHouseholdData() {
    clearTimeout(state.editTimer);
    clearTimeout(state.stockTimer);
    clearTimeout(state.customTimer);
    const files = [{
      path: "homealacarte_empty_state.json",
      content: emptyDatabaseContent,
    }];
    state.source = "empty";
    state.importedSources = files;
    state.serializedData = emptyDatabaseContent;
    state.restorePeople = null;
    state.restoreMenu = null;
    state.restoreStock = null;
    state.restoreCustom = null;
    state.autoMenuProposal = null;
    switchTab("data");
    const requestId = send("load-files", {
      files,
      language: state.language,
      source: "empty",
    });
    state.pendingDataAction = { requestId, messageKey: "empty_data_success" };
  }

  function confirmHouseholdDataReset() {
    const onlineAccount = Boolean(state.storageStatus?.email)
      && state.storageStatus.state !== "signed-out";
    openConfirmation({
      title: translate("empty_data_confirm_title"),
      message: translate(onlineAccount ? "empty_data_confirm_online" : "empty_data_confirm_local"),
      confirmLabel: translate("empty_data"),
      action: emptyAllHouseholdData,
    });
  }

  async function deleteAllPrivateData() {
    const result = await deletePrivateData();
    clearClientPreferences();
    switchTab("data");
    const message = select("#data-action-message");
    message.classList.remove("warning");
    message.textContent = translate(
      result.accountDeleted ? "delete_data_success_online" : "delete_data_success_local",
    );
    send("load-bundled", {
      manifestUrl: "./demo-data-manifest.json",
      language: state.language,
    });
  }

  function confirmPrivateDataDeletion() {
    const onlineAccount = Boolean(state.storageStatus?.email)
      && state.storageStatus.state !== "signed-out";
    openConfirmation({
      title: translate("delete_data_confirm_title"),
      message: translate(onlineAccount ? "delete_data_confirm_online" : "delete_data_confirm_local"),
      confirmLabel: translate("reset_data"),
      action: deleteAllPrivateData,
    });
  }

  function mount() {
  select("#source-status").addEventListener("click", openAccountSection);
  select("#about-open").addEventListener("click", openAboutDialog);
  select("#about-data").addEventListener("click", openAboutDialog);
  select("#about-close").addEventListener("click", closeAboutDialog);
  select("#about-done").addEventListener("click", closeAboutDialog);
  select("#account-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    setAccountBusy(true);
    select("#account-message").textContent = "";
    try {
      await signIn(select("#account-email").value.trim(), select("#account-password").value);
      reloadPage();
    } catch (error) {
      accountError(error);
      setAccountBusy(false);
    }
  });
  select("#account-create").addEventListener("click", async () => {
    if (!select("#account-email").reportValidity() || !select("#account-password").reportValidity()) return;
    if (!select("#account-privacy-consent").checked) {
      select("#account-message").textContent = translate("privacy_consent_required");
      select("#account-privacy-consent").focus();
      return;
    }
    setAccountBusy(true);
    select("#account-message").textContent = "";
    try {
      const result = await signUp(
        select("#account-email").value.trim(), select("#account-password").value,
      );
      if (result.confirmationRequired) {
        select("#account-message").textContent = translate("confirmation_required");
        setAccountBusy(false);
      } else {
        reloadPage();
      }
    } catch (error) {
      accountError(error);
      setAccountBusy(false);
    }
  });
  select("#account-sign-out").addEventListener("click", async () => {
    setAccountBusy(true);
    await signOut();
    reloadPage();
  });
  select("#account-sync-now").addEventListener("click", async () => {
    setAccountBusy(true);
    try {
      await synchronizePrivateState();
    } catch (error) {
      accountError(error);
    } finally {
      setAccountBusy(false);
    }
  });
  select("#account-use-online").addEventListener("click", async () => {
    setAccountBusy(true);
    try {
      if (await resolveSyncConflict("remote")) reloadPage();
    } catch (error) {
      accountError(error);
      setAccountBusy(false);
    }
  });
  select("#account-use-local").addEventListener("click", async () => {
    setAccountBusy(true);
    try {
      if (await resolveSyncConflict("local")) reloadPage();
      else setAccountBusy(false);
    } catch (error) {
      accountError(error);
      setAccountBusy(false);
    }
  });
  select("#privacy-request-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submit = select("#privacy-request-submit");
    const feedback = select("#privacy-request-feedback");
    submit.disabled = true;
    feedback.classList.remove("error");
    feedback.textContent = translate("privacy_request_sending");
    try {
      await submitPrivacyRequest(
        select("#privacy-request-type").value,
        select("#privacy-request-message").value.trim(),
      );
      select("#privacy-request-message").value = "";
      feedback.textContent = translate("privacy_request_sent");
      state.privacyRequestsUserId = "";
      await refreshPrivacyRequests(true);
    } catch (error) {
      feedback.classList.add("error");
      feedback.textContent = localizeError(error?.message || String(error), error?.code);
    } finally {
      submit.disabled = false;
    }
  });
  select("#export-data").addEventListener("click", () => {
    downloadData().catch((error) => showError(error?.message || String(error)));
  });
  select("#about-download-data").addEventListener("click", () => {
    closeAboutDialog();
    downloadData().catch((error) => showError(error?.message || String(error)));
  });
  select("#about-edit-data").addEventListener("click", () => {
    closeAboutDialog();
    switchTab("family");
  });
  select("#about-request-erasure").addEventListener("click", () => {
    closeAboutDialog();
    switchTab("data");
    confirmPrivateDataDeletion();
  });
  select("#download-pdf").addEventListener("click", () => {
    clearTimeout(state.editTimer);
    clearTimeout(state.stockTimer);
    clearTimeout(state.customTimer);
    send("generate-pdf", {
      language: state.language,
      rows: state.draft,
      stock: stockPayload(),
      customGrocery: customGroceryPayload(),
      excludedIds: [],
    });
  });
  select("#import-json").addEventListener("click", () => select("#json-input").click());
  select("#json-input").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (file?.name.toLowerCase().endsWith(".json")) {
      const files = [{ path: file.name, content: await file.text() }];
      state.importedSources = files;
      state.restorePeople = null;
      state.restoreMenu = null;
      state.restoreStock = null;
      state.restoreCustom = null;
      send("load-files", { files, language: state.language });
    }
    event.target.value = "";
  });
  select("#reset-data").addEventListener("click", confirmPrivateDataDeletion);
  select("#empty-data").addEventListener("click", confirmHouseholdDataReset);
  }

  return {
    closeAboutDialog,
    mount,
    openAccountSection,
    renderDataOverview,
    renderHeaderStatus,
    renderStorageStatus,
  };
}
