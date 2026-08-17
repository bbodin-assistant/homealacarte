export function installAiListUi({ documentRef, select, maxTextChars }) {
  function installStyles() {
    if (documentRef.querySelector("#ai-list-styles")) return;
    const style = documentRef.createElement("style");
    style.id = "ai-list-styles";
    style.textContent = `
      .ai-list-button{white-space:nowrap}.ai-list-dialog{width:min(720px,calc(100vw - 28px))}
      .ai-list-form{display:grid;gap:0}.ai-list-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px 24px}
      .ai-list-wide{grid-column:1/-1}.ai-list-fields textarea{min-height:210px;resize:vertical}
      .ai-list-model-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
      .ai-list-hint{margin:0;color:var(--muted);font-size:12px;line-height:1.5}.ai-list-warning{color:#8a5a18}
      .ai-list-error{margin:0;color:#9b302a;white-space:pre-wrap}.ai-list-progress{display:flex;align-items:center;gap:9px;margin:0;color:var(--muted);font-size:12px;font-weight:700}
      .ai-list-progress .spinner{position:static;width:15px;height:15px;clip:auto;clip-path:none;margin:0;overflow:visible}
      .ai-list-output{box-sizing:border-box;width:100%;height:7.5em;min-height:0!important;resize:none;overflow:auto;font:inherit;font-size:12px;line-height:1.5;color:var(--muted);background:var(--surface);white-space:pre-wrap}
      .ai-list-actions .button[hidden],.ai-list-progress[hidden],.ai-list-output[hidden],.ai-list-error:empty{display:none}
      .ai-list-actions{display:flex;justify-content:flex-end;gap:9px}
      @media(max-width:620px){.ai-list-fields{grid-template-columns:1fr;padding:18px}.ai-list-wide{grid-column:auto}}
    `;
    documentRef.head.append(style);
  }

  function installButton(beforeSelector, id, buttonMode) {
    if (select(`#${id}`)) return;
    const before = select(beforeSelector);
    if (!before) return;
    const button = documentRef.createElement("button");
    button.id = id;
    button.className = "button ghost ai-list-button";
    button.type = "button";
    button.dataset.aiListMode = buttonMode;
    before.before(button);
  }

  function installDialog() {
    if (select("#ai-list-dialog")) return;
    documentRef.body.insertAdjacentHTML("beforeend", `
      <dialog id="ai-list-dialog" class="menu-item-dialog ai-list-dialog" aria-labelledby="ai-list-title">
        <form id="ai-list-form" class="ai-list-form">
          <div class="menu-dialog-heading"><div><p class="eyebrow">AI · LLM</p><h2 id="ai-list-title"></h2><p id="ai-list-intro"></p></div>
            <button id="ai-list-close" class="dialog-close" type="button" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
          <div class="ai-list-fields">
            <label class="dialog-field ai-list-wide"><span id="ai-list-text-label"></span><textarea id="ai-list-text" maxlength="${maxTextChars}" required></textarea></label>
            <label class="dialog-field"><span id="ai-list-server-label"></span><input id="ai-list-server" type="text" inputmode="url" autocomplete="off"></label>
            <label class="dialog-field"><span id="ai-list-model-label"></span><div class="ai-list-model-row"><select id="ai-list-model" required></select><button id="ai-list-refresh" class="button ghost compact" type="button"></button></div></label>
            <p id="ai-list-privacy" class="ai-list-hint ai-list-wide"></p><p id="ai-list-cors" class="ai-list-hint ai-list-wide"></p>
            <p id="ai-list-progress" class="ai-list-progress ai-list-wide" hidden><span class="spinner"></span><span></span></p>
            <textarea id="ai-list-output" class="ai-list-output ai-list-wide" rows="5" readonly hidden aria-label="Live model output"></textarea>
            <p id="ai-list-error" class="ai-list-error ai-list-wide" role="alert"></p>
          </div>
          <div class="menu-dialog-actions ai-list-actions"><button id="ai-list-cancel" class="button ghost" type="button"></button><button id="ai-list-stop" class="button ghost" type="button" hidden></button><button id="ai-list-submit" class="button primary" type="submit"></button></div>
        </form>
      </dialog>`);
  }
  installStyles();
  installButton("#empty-stock", "add-stock-ai", "stock");
  installButton("#empty-extra-needs", "add-needs-ai", "needs");
  installDialog();
}
