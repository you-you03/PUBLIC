(function () {
  const overlayId = "__screenshot_selection_overlay__";
  const existingOverlay = document.getElementById(overlayId);
  if (existingOverlay) {
    existingOverlay.remove();
  }

  const overlay = document.createElement("div");
  overlay.id = overlayId;
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.zIndex = "2147483647";
  overlay.style.cursor = "crosshair";
  overlay.style.background = "rgba(0, 0, 0, 0.15)";
  overlay.style.userSelect = "none";

  const hint = document.createElement("div");
  hint.textContent = "Drag to select area. Esc to cancel.";
  hint.style.position = "fixed";
  hint.style.top = "16px";
  hint.style.left = "16px";
  hint.style.padding = "6px 10px";
  hint.style.background = "rgba(0, 0, 0, 0.65)";
  hint.style.color = "#ffffff";
  hint.style.fontSize = "12px";
  hint.style.borderRadius = "999px";
  hint.style.letterSpacing = "0.2px";

  const selection = document.createElement("div");
  selection.style.position = "absolute";
  selection.style.border = "2px solid #ff3b30";
  selection.style.background = "rgba(255, 59, 48, 0.15)";
  selection.style.pointerEvents = "none";
  selection.style.display = "none";

  overlay.appendChild(selection);
  overlay.appendChild(hint);
  document.documentElement.appendChild(overlay);

  let startPoint = null;
  let isDragging = false;

  function updateSelection(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    selection.style.display = "block";
    selection.style.left = `${x}px`;
    selection.style.top = `${y}px`;
    selection.style.width = `${w}px`;
    selection.style.height = `${h}px`;
    return { x, y, width: w, height: h };
  }

  function cleanup() {
    window.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      chrome.runtime.sendMessage({ type: "CANCEL_REGION" });
      cleanup();
    }
  }

  overlay.addEventListener(
    "mousedown",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      startPoint = { x: event.clientX, y: event.clientY };
      isDragging = true;
      updateSelection(startPoint, startPoint);
    },
    true
  );

  overlay.addEventListener(
    "mousemove",
    (event) => {
      if (!isDragging || !startPoint) {
        return;
      }
      updateSelection(startPoint, { x: event.clientX, y: event.clientY });
    },
    true
  );

  overlay.addEventListener(
    "mouseup",
    (event) => {
      if (!isDragging || !startPoint) {
        cleanup();
        return;
      }
      isDragging = false;
      const rect = updateSelection(startPoint, {
        x: event.clientX,
        y: event.clientY,
      });
      const minSize = 2;
      if (rect.width < minSize || rect.height < minSize) {
        cleanup();
        return;
      }
      chrome.runtime.sendMessage({
        type: "REGION_SELECTED",
        region: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          dpr: window.devicePixelRatio || 1,
        },
      });
      cleanup();
    },
    true
  );

  window.addEventListener("keydown", onKeyDown, true);
})();
