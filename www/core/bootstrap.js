const DATA_SCHEMA_VERSION = 12;
const APPLICATION_TABS = ["family", "menu", "grocery", "dishes", "items", "data"];

export function applySynchronizedPrivateState({
  state,
  saved,
  applyTranslations,
  send,
  source = "synchronized",
}) {
  if (saved?.version !== DATA_SCHEMA_VERSION || !saved.sources?.length) return false;
  state.language = saved.language || state.language;
  state.importedSources = saved.sources;
  state.restorePeople = null;
  state.restoreMenu = null;
  state.restoreStock = null;
  state.restoreCustom = null;
  applyTranslations();
  const requestId = send("load-files", {
    files: saved.sources,
    language: state.language,
    source,
  });
  state.nonPersistingRequestIds ||= new Set();
  state.nonPersistingRequestIds.add(requestId);
  return true;
}

export async function bootstrapApplication({
  state,
  requestedTab,
  loadPrivateState,
  applyColorTheme,
  applyTranslations,
  switchTab,
  send,
}) {
  applyColorTheme(state.colorTheme);
  applyTranslations();
  if (APPLICATION_TABS.includes(requestedTab)) switchTab(requestedTab);

  const saved = await loadPrivateState().catch(() => null);
  if (applySynchronizedPrivateState({
    state,
    saved,
    applyTranslations,
    send,
    source: "saved",
  })) return;

  state.importedSources = null;
  state.restorePeople = null;
  state.restoreMenu = null;
  state.restoreStock = null;
  state.restoreCustom = null;
  send("load-bundled", {
    manifestUrl: "./data-manifest.json",
    language: state.language,
  });
}
