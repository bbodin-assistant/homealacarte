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
  let activeButton = null;
  const repeater = createDragNavigationRepeater(onNavigate);

  function stop() {
    repeater.stop();
    activeButton?.classList.remove("drag-navigation-active");
    activeButton = null;
  }

  function start(button) {
    if (!button || !isDragging()) {
      stop();
      return;
    }
    if (activeButton !== button) {
      activeButton?.classList.remove("drag-navigation-active");
      activeButton = button;
      activeButton.classList.add("drag-navigation-active");
    }
    repeater.start(button.dataset.menuNavigationDays);
  }

  function mount(container, onDrop) {
    container.addEventListener("dragover", (event) => {
      const button = event.target.closest("[data-menu-navigation-days]");
      if (!button || !isDragging()) {
        stop();
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      start(button);
    });
    container.addEventListener("dragleave", (event) => {
      if (!activeButton?.contains(event.relatedTarget)) stop();
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
