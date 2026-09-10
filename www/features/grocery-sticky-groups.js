function bindStickyOffset(documentRef, windowRef, {
  panelSelector,
  controlsSelector,
  property,
}) {
  const panel = documentRef.querySelector(panelSelector);
  const controls = panel?.querySelector(controlsSelector);
  if (!panel || !controls) return null;

  let frame = 0;
  const update = () => {
    frame = 0;
    const height = Math.ceil(controls.getBoundingClientRect().height);
    panel.style.setProperty(property, `${height}px`);
  };
  const scheduleUpdate = () => {
    if (typeof windowRef.requestAnimationFrame !== "function") {
      update();
      return;
    }
    if (frame && typeof windowRef.cancelAnimationFrame === "function") {
      windowRef.cancelAnimationFrame(frame);
    }
    frame = windowRef.requestAnimationFrame(update);
  };

  update();

  if (typeof windowRef.ResizeObserver === "function") {
    const observer = new windowRef.ResizeObserver(scheduleUpdate);
    observer.observe(controls);
    return () => observer.disconnect();
  }

  windowRef.addEventListener?.("resize", scheduleUpdate, { passive: true });
  return () => windowRef.removeEventListener?.("resize", scheduleUpdate);
}

export function installGroceryStickyGroupOffsets(
  documentRef = globalThis.document,
  windowRef = globalThis.window,
) {
  if (!documentRef || !windowRef) return [];

  const bindings = [
    bindStickyOffset(documentRef, windowRef, {
      panelSelector: ".standalone-stock-panel",
      controlsSelector: ".household-sticky-table-controls",
      property: "--stock-sticky-controls-height",
    }),
    bindStickyOffset(documentRef, windowRef, {
      panelSelector: '[data-grocery-panel="purchases"] .purchase-history-panel',
      controlsSelector: ".purchase-sticky-controls",
      property: "--purchase-sticky-controls-height",
    }),
  ].filter(Boolean);

  return bindings;
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  queueMicrotask(() => installGroceryStickyGroupOffsets(document, window));
}
