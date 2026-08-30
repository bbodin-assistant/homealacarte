export const MENU_DRAG_NAVIGATION_DELAY_MS = 1000;

export function createDragNavigationRepeater(
  onNavigate,
  {
    delayMs = MENU_DRAG_NAVIGATION_DELAY_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {},
) {
  let activeStep = null;
  let timer = null;

  function stop() {
    if (timer != null) clearTimer(timer);
    activeStep = null;
    timer = null;
  }

  function start(step) {
    const parsedStep = Number(step);
    if (!Number.isFinite(parsedStep) || parsedStep === 0) {
      stop();
      return;
    }
    if (parsedStep === activeStep) return;
    stop();
    activeStep = parsedStep;
    const tick = () => {
      if (activeStep !== parsedStep) return;
      onNavigate(parsedStep);
      timer = setTimer(tick, delayMs);
    };
    timer = setTimer(tick, delayMs);
  }

  return { start, stop };
}

export function createMenuDragNavigation({ isDragging, onNavigate }) {
  let activeEdge = null;
  const repeater = createDragNavigationRepeater(onNavigate);

  function stop() {
    repeater.stop();
    activeEdge?.classList.remove("drag-navigation-active");
    activeEdge = null;
  }

  function start(edge) {
    if (!edge || !isDragging()) {
      stop();
      return;
    }
    if (activeEdge !== edge) {
      activeEdge?.classList.remove("drag-navigation-active");
      activeEdge = edge;
      activeEdge.classList.add("drag-navigation-active");
    }
    repeater.start(edge.dataset.menuDragNavigationDays);
  }

  function mount(container, onDrop) {
    container.addEventListener("dragover", (event) => {
      const edge = event.target.closest("[data-menu-drag-navigation-days]");
      if (!edge || !isDragging()) {
        stop();
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      start(edge);
    });
    container.addEventListener("dragleave", (event) => {
      if (!activeEdge?.contains(event.relatedTarget)) stop();
    });
    container.addEventListener("drop", (event) => {
      event.preventDefault();
      onDrop();
    });
  }

  return {
    mount,
    stop,
  };
}
