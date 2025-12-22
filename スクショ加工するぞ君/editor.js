const CAPTURE_KEY = "captures";
const FONT_FAMILY =
  '"Space Grotesk", "Avenir Next", "Helvetica Neue", sans-serif';
const COLOR_SWATCHES = [
  "#E03E3E", // Red (明るい赤) - デフォルト
  "#37352F", // Default (Black)
  "#9B9A97", // Gray
  "#64473A", // Brown
  "#D9730D", // Orange
  "#CAB000", // Yellow
  "#4D6461", // Green
  "#0B6E99", // Blue
  "#6940A5", // Purple
  "#AD1A72", // Pink
];
const COLOR_TARGETS = ["stroke", "fill", "text"];
const BASE_ZOOM = 0.35;
const MARKER_WIDTH_MIN = 4;
const MARKER_WIDTH_MAX = 64;
const MARKER_OPACITY_MIN = 10;
const MARKER_OPACITY_MAX = 100;
const MARKER_POINT_MIN_DISTANCE = 2;

const storageArea = chrome.storage.session || chrome.storage.local;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("canvas-stage");
const meta = document.getElementById("capture-meta");
const fileNameEl = document.getElementById("file-name");
const toastStack = document.getElementById("toast-stack");

const undoBtn = document.getElementById("undo-btn");
const redoBtn = document.getElementById("redo-btn");
const saveBtn = document.getElementById("save-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomResetBtn = document.getElementById("zoom-reset-btn");

const strokeWidthRange = document.getElementById("stroke-width");
const strokeWidthNumber = document.getElementById("stroke-width-number");
const textSizeRange = document.getElementById("text-size");
const textSizeNumber = document.getElementById("text-size-number");
const textBoldCheckbox = document.getElementById("text-bold");
const textContentInput = document.getElementById("text-content");
const arrowHeadRange = document.getElementById("arrow-head");
const arrowHeadNumber = document.getElementById("arrow-head-number");
const markerWidthRange = document.getElementById("marker-width");
const markerWidthNumber = document.getElementById("marker-width-number");
const markerOpacityRange = document.getElementById("marker-opacity");
const markerOpacityNumber = document.getElementById("marker-opacity-number");

const panelStroke = document.getElementById("panel-stroke");
const panelMarker = document.getElementById("panel-marker");
const panelText = document.getElementById("panel-text");
const arrowHeadField = document.getElementById("arrow-head-field");
const panelColorGroup = document.getElementById("panel-color-group");
const panelSizeGroup = document.getElementById("panel-size-group");

const colorGroup = document.getElementById("panel-color-group");
const colorStrokeItem = document.getElementById("color-stroke-item");
const colorFillItem = document.getElementById("color-fill-item");
const colorTextItem = document.getElementById("color-text-item");
const colorStrokeBtn = document.getElementById("color-stroke-btn");
const colorFillBtn = document.getElementById("color-fill-btn");
const colorTextBtn = document.getElementById("color-text-btn");
const colorStrokePreview = document.getElementById("color-stroke-preview");
const colorFillPreview = document.getElementById("color-fill-preview");
const colorTextPreview = document.getElementById("color-text-preview");
const colorStrokeValue = document.getElementById("color-stroke-value");
const colorFillValue = document.getElementById("color-fill-value");
const colorTextValue = document.getElementById("color-text-value");
const colorStrokePopover = document.getElementById("color-stroke-popover");
const colorFillPopover = document.getElementById("color-fill-popover");
const colorTextPopover = document.getElementById("color-text-popover");
const colorStrokeSwatches = document.getElementById("color-stroke-swatches");
const colorFillSwatches = document.getElementById("color-fill-swatches");
const colorTextSwatches = document.getElementById("color-text-swatches");
const colorStrokeCustomBtn = document.getElementById("color-stroke-custom-btn");
const colorFillCustomBtn = document.getElementById("color-fill-custom-btn");
const colorTextCustomBtn = document.getElementById("color-text-custom-btn");
const colorFillNoneBtn = document.getElementById("color-fill-none-btn");

const colorModal = document.getElementById("color-modal");
const colorPicker = document.getElementById("color-picker");
const colorHex = document.getElementById("color-hex");
const colorApplyBtn = document.getElementById("color-apply");
const colorCancelBtn = document.getElementById("color-cancel");
const colorModalPreview = document.getElementById("color-modal-preview");

const toolButtons = Array.from(document.querySelectorAll(".tool"));

const HANDLE_SIZE = 6;
const MIN_SIZE = 4;
const MAX_HISTORY = 50;
const MIN_SELECTION = 3;

const state = {
  tool: "select",
  background: null,
  objects: [],
  selectedIds: [],
  drawing: null,
  pointerDown: false,
  dragMode: null,
  startPoint: null,
  initialObjects: null,
  selectionRect: null,
  didDrag: false,
  markerSnapAxis: null,
  markerSnapOrigin: null,
  history: {
    undo: [],
    redo: [],
  },
  defaults: {
    strokeColor: COLOR_SWATCHES[0],
    strokeWidth: Number(strokeWidthRange.value),
    fillColor: "transparent",
    textColor: COLOR_SWATCHES[0],
    fontSize: Number(textSizeRange.value),
    textBold: false,
    headSize: Number(arrowHeadRange.value),
    markerWidth: Number(markerWidthRange.value),
    markerOpacity: Number(markerOpacityRange.value) / 100,
  },
  zoom: 1,
  isReady: false,
  clipboard: null,
  activeColorTarget: "stroke",
  modalTarget: null,
};

function createId() {
  return `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function cloneObject(obj) {
  if (obj.type === "marker") {
    return {
      ...obj,
      points: obj.points.map((point) => ({ x: point.x, y: point.y })),
    };
  }
  return { ...obj };
}

function cloneObjects(objects) {
  return objects.map((obj) => cloneObject(obj));
}

function recordHistory() {
  state.history.undo.push(cloneObjects(state.objects));
  if (state.history.undo.length > MAX_HISTORY) {
    state.history.undo.shift();
  }
  state.history.redo = [];
  updateUndoRedo();
}

function updateUndoRedo() {
  const hasUndo = state.history.undo.length > 1;
  const hasRedo = state.history.redo.length > 0;
  undoBtn.disabled = !state.isReady || !hasUndo;
  redoBtn.disabled = !state.isReady || !hasRedo;
}

function undo() {
  if (state.history.undo.length <= 1) {
    return;
  }
  const current = state.history.undo.pop();
  state.history.redo.push(current);
  state.objects = cloneObjects(
    state.history.undo[state.history.undo.length - 1]
  );
  state.selectedIds = [];
  updateInspector();
  render();
  updateUndoRedo();
}

function redo() {
  if (state.history.redo.length === 0) {
    return;
  }
  const next = state.history.redo.pop();
  state.history.undo.push(cloneObjects(next));
  state.objects = cloneObjects(next);
  state.selectedIds = [];
  updateInspector();
  render();
  updateUndoRedo();
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastStack.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("hidden");
    toast.remove();
  }, 3000);
}

function setReady(ready) {
  state.isReady = ready;
  toolButtons.forEach((button) => {
    button.disabled = !ready;
  });
  saveBtn.disabled = !ready;
  updateUndoRedo();
}

function setTool(tool) {
  state.tool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  if (tool === "select") {
    canvas.style.cursor = "default";
  } else if (tool === "text") {
    canvas.style.cursor = "text";
  } else {
    canvas.style.cursor = "crosshair";
  }
  updateInspector();
  updateHint();
}

function updateHint() {
  // Hint removed
}

function normalizeRect(x, y, w, h) {
  const nx = w < 0 ? x + w : x;
  const ny = h < 0 ? y + h : y;
  return {
    x: nx,
    y: ny,
    w: Math.abs(w),
    h: Math.abs(h),
  };
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function canvasToCss(point) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  return {
    x: point.x * scaleX,
    y: point.y * scaleY,
  };
}

function drawBackground() {
  if (!state.background) {
    return;
  }
  ctx.drawImage(state.background, 0, 0);
}

function shouldFill(color) {
  return color && color !== "transparent";
}

function drawRect(obj, context) {
  if (shouldFill(obj.fillColor)) {
    context.fillStyle = obj.fillColor;
    context.fillRect(obj.x, obj.y, obj.w, obj.h);
  }
  context.strokeStyle = obj.strokeColor;
  context.lineWidth = obj.strokeWidth;
  context.strokeRect(obj.x, obj.y, obj.w, obj.h);
}

function drawEllipse(obj, context) {
  const rx = obj.w / 2;
  const ry = obj.h / 2;
  context.beginPath();
  context.ellipse(obj.x + rx, obj.y + ry, rx, ry, 0, 0, Math.PI * 2);
  if (shouldFill(obj.fillColor)) {
    context.fillStyle = obj.fillColor;
    context.fill();
  }
  context.strokeStyle = obj.strokeColor;
  context.lineWidth = obj.strokeWidth;
  context.stroke();
}

function drawArrow(obj, context) {
  const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
  const head = obj.headSize || Math.max(10, obj.strokeWidth * 2);

  context.strokeStyle = obj.strokeColor;
  context.lineWidth = obj.strokeWidth;
  context.beginPath();
  context.moveTo(obj.x1, obj.y1);
  context.lineTo(obj.x2, obj.y2);
  context.stroke();

  context.beginPath();
  context.moveTo(obj.x2, obj.y2);
  context.lineTo(
    obj.x2 - head * Math.cos(angle - Math.PI / 7),
    obj.y2 - head * Math.sin(angle - Math.PI / 7)
  );
  context.lineTo(
    obj.x2 - head * Math.cos(angle + Math.PI / 7),
    obj.y2 - head * Math.sin(angle + Math.PI / 7)
  );
  context.closePath();
  context.stroke();
}

function drawText(obj, context) {
  context.fillStyle = obj.textColor;
  const fontWeight = obj.textBold ? "bold" : "normal";
  context.font = `${fontWeight} ${obj.fontSize}px ${FONT_FAMILY}`;
  context.textBaseline = "alphabetic";
  
  // 改行をサポート
  const lines = obj.text.split('\n');
  const lineHeight = obj.fontSize;
  lines.forEach((line, index) => {
    context.fillText(line, obj.x, obj.y + (index * lineHeight));
  });
}

function drawMarker(obj, context) {
  if (!obj.points || obj.points.length === 0) {
    return;
  }
  context.save();
  context.globalAlpha = obj.opacity ?? 0.4;
  context.strokeStyle = obj.strokeColor;
  context.lineWidth = obj.strokeWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(obj.points[0].x, obj.points[0].y);
  for (let i = 1; i < obj.points.length; i += 1) {
    context.lineTo(obj.points[i].x, obj.points[i].y);
  }
  context.stroke();
  if (obj.points.length === 1) {
    context.beginPath();
    context.arc(obj.points[0].x, obj.points[0].y, obj.strokeWidth / 2, 0, Math.PI * 2);
    context.fillStyle = obj.strokeColor;
    context.fill();
  }
  context.restore();
}

function drawObject(obj, context) {
  if (obj.type === "rect") {
    drawRect(obj, context);
  } else if (obj.type === "ellipse") {
    drawEllipse(obj, context);
  } else if (obj.type === "arrow") {
    drawArrow(obj, context);
  } else if (obj.type === "marker") {
    drawMarker(obj, context);
  } else if (obj.type === "text") {
    drawText(obj, context);
  }
}

function getMarkerBoundingBox(obj) {
  if (!obj.points || obj.points.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  let minX = obj.points[0].x;
  let maxX = obj.points[0].x;
  let minY = obj.points[0].y;
  let maxY = obj.points[0].y;
  obj.points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });
  const padding = (obj.strokeWidth || 1) / 2;
  return {
    x: minX - padding,
    y: minY - padding,
    w: maxX - minX + padding * 2,
    h: maxY - minY + padding * 2,
  };
}

function getBoundingBox(obj) {
  if (obj.type === "rect" || obj.type === "ellipse") {
    return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  }
  if (obj.type === "arrow") {
    const x = Math.min(obj.x1, obj.x2);
    const y = Math.min(obj.y1, obj.y2);
    const w = Math.abs(obj.x2 - obj.x1);
    const h = Math.abs(obj.y2 - obj.y1);
    return { x, y, w, h };
  }
  if (obj.type === "text") {
    ctx.save();
    const fontWeight = obj.textBold ? "bold" : "normal";
    ctx.font = `${fontWeight} ${obj.fontSize}px ${FONT_FAMILY}`;
    const lines = obj.text.split('\n');
    let maxWidth = 0;
    lines.forEach(line => {
      const width = ctx.measureText(line || "M").width;
      maxWidth = Math.max(maxWidth, width);
    });
    const height = lines.length * obj.fontSize;
    ctx.restore();
    return { x: obj.x, y: obj.y - obj.fontSize, w: maxWidth, h: height };
  }
  if (obj.type === "marker") {
    return getMarkerBoundingBox(obj);
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

function getHandles(obj) {
  if (!obj) {
    return [];
  }
  if (obj.type === "marker") {
    return [];
  }
  if (obj.type === "arrow") {
    return [
      { name: "start", x: obj.x1, y: obj.y1 },
      { name: "end", x: obj.x2, y: obj.y2 },
    ];
  }
  const box = getBoundingBox(obj);
  if (obj.type === "text") {
    return [{ name: "scale", x: box.x + box.w, y: box.y + box.h }];
  }
  const midX = box.x + box.w / 2;
  const midY = box.y + box.h / 2;
  return [
    { name: "nw", x: box.x, y: box.y },
    { name: "n", x: midX, y: box.y },
    { name: "ne", x: box.x + box.w, y: box.y },
    { name: "e", x: box.x + box.w, y: midY },
    { name: "se", x: box.x + box.w, y: box.y + box.h },
    { name: "s", x: midX, y: box.y + box.h },
    { name: "sw", x: box.x, y: box.y + box.h },
    { name: "w", x: box.x, y: midY },
  ];
}

function drawSelection(obj) {
  const box = getBoundingBox(obj);
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "#0D99FF";
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.setLineDash([]);
  const handles = getHandles(obj);
  handles.forEach((handle) => {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0D99FF";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(
      handle.x - HANDLE_SIZE,
      handle.y - HANDLE_SIZE,
      HANDLE_SIZE * 2,
      HANDLE_SIZE * 2
    );
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawSelectionBox(rect) {
  if (!rect) {
    return;
  }
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "#0D99FF";
  ctx.fillStyle = "rgba(13, 153, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

function collectLayers(includeDrawing = false) {
  const layers = {
    markers: [],
    shapes: [],
    text: [],
  };
  const addToLayer = (obj) => {
    if (obj.type === "marker") {
      layers.markers.push(obj);
    } else if (obj.type === "text") {
      layers.text.push(obj);
    } else {
      layers.shapes.push(obj);
    }
  };
  state.objects.forEach((obj) => {
    if (!obj._editing) {
      addToLayer(obj);
    }
  });
  if (includeDrawing && state.drawing) {
    addToLayer(state.drawing);
  }
  return layers;
}

function render() {
  if (!state.background) {
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  const layers = collectLayers(true);
  layers.markers.forEach((obj) => drawObject(obj, ctx));
  layers.shapes.forEach((obj) => drawObject(obj, ctx));
  layers.text.forEach((obj) => drawObject(obj, ctx));
  if (state.selectionRect) {
    drawSelectionBox(state.selectionRect);
  }
  const selectedObjects = getSelectedObjects();
  selectedObjects.forEach((obj) => {
    if (!obj._editing) {
      drawSelection(obj);
    }
  });
}

function hitHandle(obj, point) {
  const handles = getHandles(obj);
  for (const handle of handles) {
    if (
      Math.abs(point.x - handle.x) <= HANDLE_SIZE + 2 &&
      Math.abs(point.y - handle.y) <= HANDLE_SIZE + 2
    ) {
      return handle;
    }
  }
  return null;
}

function hitHandleForSelection(point) {
  const selectedObjects = getSelectedObjects();
  for (let i = selectedObjects.length - 1; i >= 0; i -= 1) {
    const obj = selectedObjects[i];
    const handle = hitHandle(obj, point);
    if (handle) {
      return { obj, handle };
    }
  }
  return null;
}

function pointInBox(point, box) {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.w &&
    point.y >= box.y &&
    point.y <= box.y + box.h
  );
}

function boxesIntersect(a, b) {
  return (
    a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y
  );
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  const t =
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + clamped * dx, y: a.y + clamped * dy };
  return Math.hypot(point.x - proj.x, point.y - proj.y);
}

function distanceToPolyline(point, points) {
  if (!points || points.length === 0) {
    return Infinity;
  }
  if (points.length === 1) {
    return Math.hypot(point.x - points[0].x, point.y - points[0].y);
  }
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const dist = distanceToSegment(point, points[i], points[i + 1]);
    min = Math.min(min, dist);
  }
  return min;
}

function getPolylineLength(points) {
  if (!points || points.length < 2) {
    return 0;
  }
  let length = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    length += Math.hypot(
      points[i + 1].x - points[i].x,
      points[i + 1].y - points[i].y
    );
  }
  return length;
}

function hitTest(point) {
  const layers = collectLayers(false);
  const drawOrder = [...layers.markers, ...layers.shapes, ...layers.text];
  for (let i = drawOrder.length - 1; i >= 0; i -= 1) {
    const obj = drawOrder[i];
    if (obj.type === "rect" || obj.type === "ellipse" || obj.type === "text") {
      const box = getBoundingBox(obj);
      if (pointInBox(point, box)) {
        return obj;
      }
    } else if (obj.type === "arrow") {
      const dist = distanceToSegment(
        point,
        { x: obj.x1, y: obj.y1 },
        { x: obj.x2, y: obj.y2 }
      );
      if (dist <= obj.strokeWidth + 6) {
        return obj;
      }
    } else if (obj.type === "marker") {
      const dist = distanceToPolyline(point, obj.points);
      const threshold = obj.strokeWidth / 2 + 6;
      if (dist <= threshold) {
        return obj;
      }
    }
  }
  return null;
}

function createObject(tool, startPoint) {
  const base = {
    id: createId(),
    strokeColor: state.defaults.strokeColor,
    strokeWidth: state.defaults.strokeWidth,
    fillColor: state.defaults.fillColor,
    textColor: state.defaults.textColor,
    fontSize: state.defaults.fontSize,
    headSize: state.defaults.headSize,
  };
  if (tool === "rect") {
    return { ...base, type: "rect", x: startPoint.x, y: startPoint.y, w: 0, h: 0 };
  }
  if (tool === "ellipse") {
    return { ...base, type: "ellipse", x: startPoint.x, y: startPoint.y, w: 0, h: 0 };
  }
  if (tool === "arrow") {
    return {
      ...base,
      type: "arrow",
      x1: startPoint.x,
      y1: startPoint.y,
      x2: startPoint.x,
      y2: startPoint.y,
    };
  }
  if (tool === "marker") {
    return {
      ...base,
      type: "marker",
      strokeWidth: state.defaults.markerWidth,
      opacity: state.defaults.markerOpacity,
      points: [{ x: startPoint.x, y: startPoint.y }],
    };
  }
  return null;
}

function updateDrawing(point, event) {
  if (!state.drawing || !state.startPoint) {
    return;
  }
  if (state.drawing.type === "rect" || state.drawing.type === "ellipse") {
    let w = point.x - state.startPoint.x;
    let h = point.y - state.startPoint.y;
    if (event.altKey) {
      w *= 2;
      h *= 2;
    }
    if (event.shiftKey) {
      const size = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * size;
      h = Math.sign(h || 1) * size;
    }
    const originX = event.altKey ? state.startPoint.x - w / 2 : state.startPoint.x;
    const originY = event.altKey ? state.startPoint.y - h / 2 : state.startPoint.y;
    const norm = normalizeRect(originX, originY, w, h);
    state.drawing.x = norm.x;
    state.drawing.y = norm.y;
    state.drawing.w = norm.w;
    state.drawing.h = norm.h;
  } else if (state.drawing.type === "arrow") {
    let dx = point.x - state.startPoint.x;
    let dy = point.y - state.startPoint.y;
    if (event.shiftKey) {
      const angle = Math.atan2(dy, dx);
      const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      dx = Math.cos(snap) * len;
      dy = Math.sin(snap) * len;
    }
    state.drawing.x2 = state.startPoint.x + dx;
    state.drawing.y2 = state.startPoint.y + dy;
  } else if (state.drawing.type === "marker") {
    const points = state.drawing.points || [];
    const last = points[points.length - 1] || state.startPoint;
    let nextPoint = point;
    if (event.shiftKey) {
      if (!state.markerSnapAxis) {
        state.markerSnapOrigin = last;
        const dx = point.x - last.x;
        const dy = point.y - last.y;
        state.markerSnapAxis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }
      const origin = state.markerSnapOrigin || last;
      if (state.markerSnapAxis === "x") {
        nextPoint = { x: point.x, y: origin.y };
      } else {
        nextPoint = { x: origin.x, y: point.y };
      }
    } else {
      state.markerSnapAxis = null;
      state.markerSnapOrigin = null;
    }
    if (
      Math.hypot(nextPoint.x - last.x, nextPoint.y - last.y) >=
      MARKER_POINT_MIN_DISTANCE
    ) {
      points.push({ x: nextPoint.x, y: nextPoint.y });
      state.drawing.points = points;
    }
  }
}

function finalizeDrawing() {
  if (!state.drawing) {
    return;
  }
  if (
    (state.drawing.type === "rect" || state.drawing.type === "ellipse") &&
    (state.drawing.w < MIN_SIZE || state.drawing.h < MIN_SIZE)
  ) {
    state.drawing = null;
    state.markerSnapAxis = null;
    state.markerSnapOrigin = null;
    render();
    return;
  }
  if (
    state.drawing.type === "arrow" &&
    Math.hypot(
      state.drawing.x2 - state.drawing.x1,
      state.drawing.y2 - state.drawing.y1
    ) < MIN_SIZE
  ) {
    state.drawing = null;
    state.markerSnapAxis = null;
    state.markerSnapOrigin = null;
    render();
    return;
  }
  if (state.drawing.type === "marker") {
    const length = getPolylineLength(state.drawing.points);
    if (length < MIN_SIZE) {
      state.drawing = null;
      state.markerSnapAxis = null;
      state.markerSnapOrigin = null;
      render();
      return;
    }
  }
  state.objects.push({ ...state.drawing });
  state.selectedIds = [state.drawing.id];
  state.drawing = null;
  state.markerSnapAxis = null;
  state.markerSnapOrigin = null;
  recordHistory();
  render();
  if (state.tool !== "select") {
    setTool("select");
  } else {
    updateInspector();
    updateHint();
  }
}

function getSelected() {
  const ids = state.selectedIds;
  if (ids.length === 0) {
    return null;
  }
  return state.objects.find((obj) => obj.id === ids[ids.length - 1]) || null;
}

function getSelectedObjects() {
  if (state.selectedIds.length === 0) {
    return [];
  }
  const set = new Set(state.selectedIds);
  return state.objects.filter((obj) => set.has(obj.id));
}

function updateSelectionStyles(obj) {
  if (!obj) {
    return;
  }
  syncControls(obj);
}

function applyToSelected(filterFn, updater, commit) {
  const targets = getSelectedObjects().filter(filterFn);
  if (targets.length > 0) {
    targets.forEach((obj) => updater(obj));
    render();
    if (commit) {
      recordHistory();
    }
    return true;
  }
  return false;
}

function setStrokeColor(color, commit = false) {
  const changed = applyToSelected(
    (obj) => obj.type !== "text",
    (obj) => {
      obj.strokeColor = color;
    },
    commit
  );
  if (!changed) {
    state.defaults.strokeColor = color;
  }
  updateColorUI();
}

function setFillColor(color, commit = false) {
  const changed = applyToSelected(
    (obj) => obj.type === "rect" || obj.type === "ellipse",
    (obj) => {
      obj.fillColor = color;
    },
    commit
  );
  if (!changed) {
    state.defaults.fillColor = color;
  }
  updateColorUI();
}

function setTextColor(color, commit = false) {
  const changed = applyToSelected(
    (obj) => obj.type === "text",
    (obj) => {
      obj.textColor = color;
    },
    commit
  );
  if (!changed) {
    state.defaults.textColor = color;
  }
  updateColorUI();
}

function setStrokeWidth(value, commit = false) {
  const width = clampNumber(value, 1, 20);
  const changed = applyToSelected(
    (obj) => obj.type === "rect" || obj.type === "ellipse" || obj.type === "arrow",
    (obj) => {
      obj.strokeWidth = width;
    },
    commit
  );
  if (!changed) {
    state.defaults.strokeWidth = width;
  }
  syncControls(getSelected());
}

function setTextSize(value, commit = false) {
  const size = clampNumber(value, 8, 72);
  const changed = applyToSelected(
    (obj) => obj.type === "text",
    (obj) => {
      obj.fontSize = size;
    },
    commit
  );
  if (!changed) {
    state.defaults.fontSize = size;
  }
  syncControls(getSelected());
  render();
}

function setTextBold(value, commit = false) {
  const changed = applyToSelected(
    (obj) => obj.type === "text",
    (obj) => {
      obj.textBold = value;
    },
    commit
  );
  if (!changed) {
    state.defaults.textBold = value;
  }
  syncControls(getSelected());
  render();
}

function setHeadSize(value, commit = false) {
  const size = clampNumber(value, 6, 30);
  const changed = applyToSelected(
    (obj) => obj.type === "arrow",
    (obj) => {
      obj.headSize = size;
    },
    commit
  );
  if (!changed) {
    state.defaults.headSize = size;
  }
  syncControls(getSelected());
}

function setMarkerWidth(value, commit = false) {
  const width = clampNumber(value, MARKER_WIDTH_MIN, MARKER_WIDTH_MAX);
  const changed = applyToSelected(
    (obj) => obj.type === "marker",
    (obj) => {
      obj.strokeWidth = width;
    },
    commit
  );
  if (!changed) {
    state.defaults.markerWidth = width;
  }
  syncControls(getSelected());
  render();
}

function setMarkerOpacity(value, commit = false) {
  const opacityValue = clampNumber(value, MARKER_OPACITY_MIN, MARKER_OPACITY_MAX);
  const opacity = opacityValue / 100;
  const changed = applyToSelected(
    (obj) => obj.type === "marker",
    (obj) => {
      obj.opacity = opacity;
    },
    commit
  );
  if (!changed) {
    state.defaults.markerOpacity = opacity;
  }
  syncControls(getSelected());
  render();
}

function syncControls(selected = getSelected()) {
  const strokeWidth = selected?.strokeWidth ?? state.defaults.strokeWidth;
  strokeWidthRange.value = strokeWidth;
  strokeWidthNumber.value = strokeWidth;

  const textSize = selected?.fontSize ?? state.defaults.fontSize;
  textSizeRange.value = textSize;
  textSizeNumber.value = textSize;

  const textBold = selected?.textBold ?? state.defaults.textBold;
  if (textBoldCheckbox) {
    textBoldCheckbox.checked = textBold;
  }

  // テキスト内容を同期
  if (selected?.type === "text" && textContentInput) {
    textContentInput.value = selected.text || "";
  } else if (textContentInput) {
    textContentInput.value = "";
  }

  const headSize = selected?.headSize ?? state.defaults.headSize;
  arrowHeadRange.value = headSize;
  arrowHeadNumber.value = headSize;

  const markerWidth =
    selected?.type === "marker" ? selected.strokeWidth : state.defaults.markerWidth;
  markerWidthRange.value = markerWidth;
  markerWidthNumber.value = markerWidth;

  const markerOpacity =
    selected?.type === "marker" ? selected.opacity : state.defaults.markerOpacity;
  const markerOpacityPercent = Math.round(markerOpacity * 100);
  markerOpacityRange.value = markerOpacityPercent;
  markerOpacityNumber.value = markerOpacityPercent;

  updateColorUI();
}

function clampNumber(value, min, max) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return min;
  }
  return Math.min(max, Math.max(min, num));
}

function bindRangeNumber(rangeEl, numberEl, setter) {
  rangeEl.addEventListener("input", (event) => {
    setter(event.target.value, false);
  });
  rangeEl.addEventListener("change", (event) => {
    setter(event.target.value, true);
  });
  numberEl.addEventListener("input", (event) => {
    setter(event.target.value, false);
  });
  numberEl.addEventListener("change", (event) => {
    setter(event.target.value, true);
  });
}

function getColorForTarget(target) {
  const selected = getSelected();
  if (selected) {
    if (target === "stroke" && selected.type !== "text") {
      return selected.strokeColor;
    }
    if (target === "fill" && (selected.type === "rect" || selected.type === "ellipse")) {
      return selected.fillColor;
    }
    if (target === "text" && selected.type === "text") {
      return selected.textColor;
    }
  }
  if (target === "stroke") {
    return state.defaults.strokeColor;
  }
  if (target === "fill") {
    return state.defaults.fillColor;
  }
  return state.defaults.textColor;
}

function updateColorUI() {
  // Stroke color
  const strokeColor = getColorForTarget("stroke");
  if (strokeColor === "transparent") {
    colorStrokePreview.classList.add("transparent");
    colorStrokePreview.style.backgroundColor = "transparent";
    colorStrokeValue.textContent = "Transparent";
  } else {
    colorStrokePreview.classList.remove("transparent");
    colorStrokePreview.style.backgroundColor = strokeColor;
    colorStrokeValue.textContent = strokeColor.toUpperCase();
  }
  
  // Fill color
  const fillColor = getColorForTarget("fill");
  if (fillColor === "transparent") {
    colorFillPreview.classList.add("transparent");
    colorFillPreview.style.backgroundColor = "transparent";
    colorFillValue.textContent = "None";
  } else {
    colorFillPreview.classList.remove("transparent");
    colorFillPreview.style.backgroundColor = fillColor;
    colorFillValue.textContent = fillColor.toUpperCase();
  }
  
  // Text color
  const textColor = getColorForTarget("text");
  if (textColor === "transparent") {
    colorTextPreview.classList.add("transparent");
    colorTextPreview.style.backgroundColor = "transparent";
    colorTextValue.textContent = "Transparent";
  } else {
    colorTextPreview.classList.remove("transparent");
    colorTextPreview.style.backgroundColor = textColor;
    colorTextValue.textContent = textColor.toUpperCase();
  }
}


function renderColorSwatches(target) {
  const current = getColorForTarget(target);
  const swatchesEl = target === "stroke" ? colorStrokeSwatches : target === "fill" ? colorFillSwatches : colorTextSwatches;
  swatchesEl.innerHTML = "";
  COLOR_SWATCHES.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;
    swatch.setAttribute("aria-label", color);
    if (current.toLowerCase() === color.toLowerCase()) {
      swatch.classList.add("active");
    }
    swatch.addEventListener("click", () => {
      if (target === "stroke") {
        setStrokeColor(color, true);
      } else if (target === "fill") {
        setFillColor(color, true);
      } else {
        setTextColor(color, true);
      }
      closeColorPopover(target);
    });
    swatchesEl.appendChild(swatch);
  });
}

function openColorPopover(target) {
  renderColorSwatches(target);
  const popover = target === "stroke" ? colorStrokePopover : target === "fill" ? colorFillPopover : colorTextPopover;
  popover.classList.remove("hidden");
}

function closeColorPopover(target) {
  if (target) {
    const popover = target === "stroke" ? colorStrokePopover : target === "fill" ? colorFillPopover : colorTextPopover;
    popover.classList.add("hidden");
  } else {
    colorStrokePopover.classList.add("hidden");
    colorFillPopover.classList.add("hidden");
    colorTextPopover.classList.add("hidden");
  }
}

function toggleColorPopover(target) {
  const popover = target === "stroke" ? colorStrokePopover : target === "fill" ? colorFillPopover : colorTextPopover;
  if (popover.classList.contains("hidden")) {
    closeColorPopover(); // 他のポップオーバーを閉じる
    openColorPopover(target);
  } else {
    closeColorPopover(target);
  }
}

function openColorModal(target) {
  state.modalTarget = target;
  const current = getColorForTarget(target);
  const value = current === "transparent" ? COLOR_SWATCHES[0] : current;
  colorPicker.value = value;
  colorHex.value = value;
  colorModalPreview.style.backgroundColor = value;
  colorModal.classList.remove("hidden");
  colorHex.focus();
}

function closeColorModal() {
  colorModal.classList.add("hidden");
  state.modalTarget = null;
}

function applyCustomColor() {
  const hex = normalizeHex(colorHex.value || colorPicker.value);
  if (!hex) {
    return;
  }
  if (state.modalTarget === "stroke") {
    setStrokeColor(hex, true);
  } else if (state.modalTarget === "fill") {
    setFillColor(hex, true);
  } else if (state.modalTarget === "text") {
    setTextColor(hex, true);
  }
  closeColorModal();
}

function normalizeHex(value) {
  const trimmed = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }
  return null;
}

function syncColorTargetFromContext() {
  const selectedObjects = getSelectedObjects();
  const hasText = selectedObjects.some((obj) => obj.type === "text");
  const hasShape = selectedObjects.some(
    (obj) => obj.type === "rect" || obj.type === "ellipse"
  );
  const hasArrow = selectedObjects.some((obj) => obj.type === "arrow");
  const hasMarker = selectedObjects.some((obj) => obj.type === "marker");

  // 選択されていない時は、ツールに応じて表示
  if (selectedObjects.length === 0) {
    if (state.tool === "text") {
      colorStrokeItem.classList.add("hidden");
      colorFillItem.classList.add("hidden");
      colorTextItem.classList.remove("hidden");
    } else if (state.tool === "marker") {
      colorStrokeItem.classList.remove("hidden");
      colorFillItem.classList.add("hidden");
      colorTextItem.classList.add("hidden");
    } else if (state.tool === "rect" || state.tool === "ellipse") {
      colorStrokeItem.classList.remove("hidden");
      colorFillItem.classList.remove("hidden");
      colorTextItem.classList.add("hidden");
    } else {
      // arrow, select
      colorStrokeItem.classList.remove("hidden");
      colorFillItem.classList.add("hidden");
      colorTextItem.classList.add("hidden");
    }
    return;
  }

  // 選択されている時は、選択オブジェクトに応じて表示
  if (hasText && !hasShape && !hasArrow && !hasMarker) {
    // テキストのみ選択
    colorStrokeItem.classList.add("hidden");
    colorFillItem.classList.add("hidden");
    colorTextItem.classList.remove("hidden");
  } else if (hasShape || hasArrow || hasMarker) {
    // 図形または矢印が選択されている
    colorStrokeItem.classList.remove("hidden");
    if (hasShape) {
      colorFillItem.classList.remove("hidden");
    } else {
      colorFillItem.classList.add("hidden");
    }
    colorTextItem.classList.add("hidden");
  }
}

function updateInspector() {
  const selectedObjects = getSelectedObjects();
  const hasSelection = selectedObjects.length > 0;
  const hasText = selectedObjects.some((obj) => obj.type === "text");
  const hasStroke = selectedObjects.some(
    (obj) => obj.type === "rect" || obj.type === "ellipse" || obj.type === "arrow"
  );
  const hasArrow = selectedObjects.some((obj) => obj.type === "arrow");
  const hasMarker = selectedObjects.some((obj) => obj.type === "marker");

  // 色選択グループは常に表示（選択されていない時もツールに応じて表示）
  panelColorGroup.classList.remove("hidden");
  
  // サイズグループは選択時、または作成ツールのDefaults表示で使用
  if (!hasSelection) {
    const showDefaults = state.tool !== "select";
    panelSizeGroup.classList.toggle("hidden", !showDefaults);
    panelStroke.classList.toggle(
      "hidden",
      !(state.tool === "rect" || state.tool === "ellipse" || state.tool === "arrow")
    );
    panelText.classList.toggle("hidden", state.tool !== "text");
    panelMarker.classList.toggle("hidden", state.tool !== "marker");
  } else {
    panelSizeGroup.classList.remove("hidden");

    // 個別のパネルを表示/非表示
    panelStroke.classList.toggle("hidden", !hasStroke);
    panelText.classList.toggle("hidden", !hasText);
    panelMarker.classList.toggle("hidden", !hasMarker);
  }
  arrowHeadField.classList.toggle(
    "hidden",
    !(hasArrow || (!hasSelection && state.tool === "arrow"))
  );

  syncColorTargetFromContext();
  syncControls(getSelected());
  updateColorUI();
}

function updateTextInputSize(input, textObj) {
  const fontSize = textObj ? textObj.fontSize : state.defaults.fontSize;
  const fontWeight = (textObj ? textObj.textBold : state.defaults.textBold) ? "bold" : "normal";
  
  // フォントサイズとline-heightを正確に設定（実際のテキストと完全に一致）
  input.style.fontSize = `${fontSize}px`;
  input.style.lineHeight = `${fontSize}px`;
  input.style.fontWeight = fontWeight;
  input.style.fontFamily = FONT_FAMILY;
}

function startTextInput(point, textObj = null) {
  const existing = stage.querySelector(".text-input");
  if (existing) {
    existing.remove();
  }
  
  // 既存テキストを編集する場合、そのテキストを一時的に非表示にする
  if (textObj) {
    textObj._editing = true;
  }
  
  const input = document.createElement("textarea");
  input.className = "text-input";
  input.dataset.editingId = textObj ? textObj.id : null;
  input.style.position = "absolute";
  input.style.border = "none";
  input.style.outline = "none";
  input.style.padding = "0";
  input.style.margin = "0";
  input.style.background = "transparent";
  input.style.resize = "none";
  input.style.overflow = "hidden";
  input.style.whiteSpace = "pre";
  input.style.wordWrap = "off";
  
  if (textObj) {
    // 既存のテキストを編集 - 既存テキストの位置とサイズを正確に取得
    input.value = textObj.text;
    input.style.fontFamily = FONT_FAMILY;
    input.style.fontSize = `${textObj.fontSize}px`;
    input.style.fontWeight = textObj.textBold ? "bold" : "normal";
    input.style.color = textObj.textColor;
    
    // 既存テキストのバウンディングボックスを取得して位置を設定
    const box = getBoundingBox(textObj);
    
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const offsetX = canvasRect.left - stageRect.left;
    const offsetY = canvasRect.top - stageRect.top;
    
    // Canvas座標をCSS座標に変換
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    
    // 既存テキストの位置に正確に配置
    input.style.left = `${offsetX + box.x * scaleX}px`;
    input.style.top = `${offsetY + box.y * scaleY}px`;
    
    // フォントスタイルを設定
    updateTextInputSize(input, textObj);
    
    // 初期サイズを既存テキストのサイズに設定（入力時に動的に更新される）
    input.style.width = `${Math.ceil(box.w * scaleX)}px`;
    input.style.height = `${Math.ceil(box.h * scaleY)}px`;
  } else {
    // 新しいテキストを作成
    input.placeholder = "Type";
    input.style.fontFamily = FONT_FAMILY;
    input.style.fontSize = `${state.defaults.fontSize}px`;
    input.style.fontWeight = state.defaults.textBold ? "bold" : "normal";
    input.style.color = state.defaults.textColor;
    
    updateTextInputSize(input, null);
    
    // 新規作成時もサイズをCSS座標に変換して設定
    const tempObj = {
      type: "text",
      text: input.value || input.placeholder || "M",
      fontSize: state.defaults.fontSize,
      textBold: state.defaults.textBold,
      x: point.x,
      y: point.y,
    };
    const box = getBoundingBox(tempObj);
    
    const cssPoint = canvasToCss(point);
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const offsetX = canvasRect.left - stageRect.left;
    const offsetY = canvasRect.top - stageRect.top;
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    
    input.style.left = `${offsetX + cssPoint.x}px`;
    input.style.top = `${offsetY + cssPoint.y - state.defaults.fontSize}px`;
    input.style.width = `${Math.ceil(box.w * scaleX)}px`;
    input.style.height = `${Math.ceil(box.h * scaleY)}px`;
  }
  
  stage.appendChild(input);
  
  // テキスト入力時にサイズを動的に調整
  const updateSize = () => {
    updateTextInputSize(input, textObj);
    
    // サイズを計算
    const tempObj = textObj ? { ...textObj, text: input.value } : {
      type: "text",
      text: input.value || input.placeholder || "M",
      fontSize: state.defaults.fontSize,
      textBold: state.defaults.textBold,
      x: point.x,
      y: point.y,
    };
    const box = getBoundingBox(tempObj);
    
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    
    // サイズを更新（位置は既存テキストの場合は維持）
    input.style.width = `${Math.ceil(box.w * scaleX)}px`;
    input.style.height = `${Math.ceil(box.h * scaleY)}px`;
  };
  
  input.addEventListener("input", updateSize);
  
  requestAnimationFrame(() => {
    input.focus();
    if (!textObj) {
      input.select();
    } else {
      // 既存テキスト編集時はカーソルを末尾に
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  const finalize = () => {
    // 既存テキストの編集フラグを解除
    if (textObj) {
      textObj._editing = false;
    }
    
    // 改行を保持しつつ、先頭と末尾の空白のみを削除
    let text = input.value;
    text = text.replace(/^\s+|\s+$/g, '');
    input.remove();
    if (textObj) {
      // 既存のテキストを更新
      if (text) {
        textObj.text = text;
        recordHistory();
        render();
      } else {
        // 空の場合は削除
        state.objects = state.objects.filter((obj) => obj.id !== textObj.id);
        state.selectedIds = state.selectedIds.filter((id) => id !== textObj.id);
        recordHistory();
        render();
      }
    } else {
      // 新しいテキストを作成
      if (text) {
        const id = createId();
        state.objects.push({
          id,
          type: "text",
          x: point.x,
          y: point.y,
          text,
          textColor: state.defaults.textColor,
          fontSize: state.defaults.fontSize,
          textBold: state.defaults.textBold,
          strokeColor: state.defaults.strokeColor,
          strokeWidth: state.defaults.strokeWidth,
        });
        state.selectedIds = [id];
        recordHistory();
        render();
      }
      setTool("select");
    }
  };

  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finalize();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (textObj) {
        textObj._editing = false;
      }
      input.remove();
      if (!textObj) {
        showToast("Cancelled");
        setTool("select");
      } else {
        render();
      }
    }
  });

  input.addEventListener("blur", finalize, { once: true });
}

function captureInitialObjects(ids) {
  const map = {};
  ids.forEach((id) => {
    const obj = state.objects.find((item) => item.id === id);
    if (obj) {
      map[id] = cloneObject(obj);
    }
  });
  return map;
}

function updateObjectOnDrag(point) {
  const selectedObjects = getSelectedObjects();
  if (selectedObjects.length === 0 || !state.initialObjects || !state.startPoint) {
    return;
  }
  const dx = point.x - state.startPoint.x;
  const dy = point.y - state.startPoint.y;

  if (state.dragMode?.type === "move") {
    selectedObjects.forEach((selected) => {
      const initial = state.initialObjects[selected.id];
      if (!initial) {
        return;
      }
      if (selected.type === "rect" || selected.type === "ellipse") {
        selected.x = initial.x + dx;
        selected.y = initial.y + dy;
      } else if (selected.type === "arrow") {
        selected.x1 = initial.x1 + dx;
        selected.y1 = initial.y1 + dy;
        selected.x2 = initial.x2 + dx;
        selected.y2 = initial.y2 + dy;
      } else if (selected.type === "marker") {
        selected.points = initial.points.map((point) => ({
          x: point.x + dx,
          y: point.y + dy,
        }));
      } else if (selected.type === "text") {
        selected.x = initial.x + dx;
        selected.y = initial.y + dy;
      }
    });
  }

  if (state.dragMode?.type === "resize") {
    const targetId = state.dragMode.targetId;
    const selected = selectedObjects.find((obj) => obj.id === targetId);
    const initial = state.initialObjects[targetId];
    if (!selected || !initial) {
      return;
    }
    const handle = state.dragMode.handle;
    if (selected.type === "rect" || selected.type === "ellipse") {
      let x = initial.x;
      let y = initial.y;
      let w = initial.w;
      let h = initial.h;
      if (handle === "nw") {
        x += dx;
        y += dy;
        w -= dx;
        h -= dy;
      } else if (handle === "ne") {
        y += dy;
        w += dx;
        h -= dy;
      } else if (handle === "se") {
        w += dx;
        h += dy;
      } else if (handle === "sw") {
        x += dx;
        w -= dx;
        h += dy;
      } else if (handle === "n") {
        y += dy;
        h -= dy;
      } else if (handle === "s") {
        h += dy;
      } else if (handle === "e") {
        w += dx;
      } else if (handle === "w") {
        x += dx;
        w -= dx;
      }
      const norm = normalizeRect(x, y, w, h);
      selected.x = norm.x;
      selected.y = norm.y;
      selected.w = norm.w;
      selected.h = norm.h;
    } else if (selected.type === "arrow") {
      if (handle === "start") {
        selected.x1 = initial.x1 + dx;
        selected.y1 = initial.y1 + dy;
      } else if (handle === "end") {
        selected.x2 = initial.x2 + dx;
        selected.y2 = initial.y2 + dy;
      }
    } else if (selected.type === "text") {
      selected.fontSize = clampNumber(initial.fontSize + dy, 8, 72);
      textSizeRange.value = selected.fontSize;
      textSizeNumber.value = selected.fontSize;
    }
  }
}

function cancelDrawing() {
  if (state.drawing) {
    state.drawing = null;
    state.markerSnapAxis = null;
    state.markerSnapOrigin = null;
    render();
  }
}

function clearSelection() {
  if (state.selectedIds.length > 0) {
    state.selectedIds = [];
    updateInspector();
    render();
  }
}

function stopDrag() {
  state.pointerDown = false;
  state.dragMode = null;
  state.startPoint = null;
  state.initialObjects = null;
  state.didDrag = false;
  state.markerSnapAxis = null;
  state.markerSnapOrigin = null;
}

function applyZoom(value) {
  const zoom = clampNumber(value, 0.25, 3);
  state.zoom = zoom;
  const actual = zoom * BASE_ZOOM;
  canvas.style.width = `${canvas.width * actual}px`;
  canvas.style.height = `${canvas.height * actual}px`;
  zoomResetBtn.textContent = `${Math.round(zoom * 100)}%`;
}

function zoomBy(delta) {
  applyZoom(state.zoom + delta);
}

function fitZoom() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap || !canvas.width || !canvas.height) {
    applyZoom(1);
    return;
  }
  const rect = wrap.getBoundingClientRect();
  const maxWidth = rect.width - 80;
  const maxHeight = rect.height - 80;
  if (maxWidth <= 0 || maxHeight <= 0) {
    applyZoom(1);
    return;
  }
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height, 1);
  applyZoom(scale / BASE_ZOOM);
}

function copySelection() {
  const selectedObjects = getSelectedObjects();
  if (selectedObjects.length === 0) {
    return;
  }
  state.clipboard = selectedObjects.map((obj) => cloneObject(obj));
  showToast("Copied");
}

function pasteSelection() {
  if (!state.clipboard || state.clipboard.length === 0) {
    return;
  }
  const newIds = [];
  const copies = state.clipboard.map((item) => {
    const copy = { ...cloneObject(item), id: createId() };
    if (copy.type === "rect" || copy.type === "ellipse") {
      copy.x += 12;
      copy.y += 12;
    } else if (copy.type === "arrow") {
      copy.x1 += 12;
      copy.y1 += 12;
      copy.x2 += 12;
      copy.y2 += 12;
    } else if (copy.type === "marker") {
      copy.points = copy.points.map((point) => ({
        x: point.x + 12,
        y: point.y + 12,
      }));
    } else if (copy.type === "text") {
      copy.x += 12;
      copy.y += 12;
    }
    newIds.push(copy.id);
    return copy;
  });
  state.objects.push(...copies);
  state.selectedIds = newIds;
  recordHistory();
  updateInspector();
  render();
  showToast("Pasted");
}

function finalizeSelectionBox() {
  if (!state.selectionRect) {
    return;
  }
  const rect = state.selectionRect;
  state.selectionRect = null;
  if (rect.w < MIN_SELECTION || rect.h < MIN_SELECTION) {
    clearSelection();
    return;
  }
  const selected = state.objects.filter((obj) =>
    boxesIntersect(getBoundingBox(obj), rect)
  );
  state.selectedIds = selected.map((obj) => obj.id);
  updateInspector();
  render();
}

// ダブルクリックでテキストを選択して右サイドバーの入力欄にフォーカス
canvas.addEventListener("dblclick", (event) => {
  if (!state.background || !state.isReady) {
    return;
  }
  const point = getCanvasPoint(event);
  const hit = hitTest(point);
  if (hit && hit.type === "text") {
    event.preventDefault();
    event.stopPropagation();
    // テキストを選択
    state.selectedIds = [hit.id];
    updateInspector();
    render();
    // 右サイドバーのテキスト入力欄にフォーカス
    if (textContentInput) {
      requestAnimationFrame(() => {
        textContentInput.focus();
        textContentInput.setSelectionRange(textContentInput.value.length, textContentInput.value.length);
      });
    }
  }
});

canvas.addEventListener("mousedown", (event) => {
  if (!state.background || !state.isReady) {
    return;
  }
  const point = getCanvasPoint(event);
  state.pointerDown = true;
  state.didDrag = false;
  state.startPoint = point;

  if (state.tool === "text") {
    // テキストツールでクリックした時は新しいテキストを作成
    state.pointerDown = false;
    const id = createId();
    const newText = {
      id,
      type: "text",
      x: point.x,
      y: point.y,
      text: "",
      textColor: state.defaults.textColor,
      fontSize: state.defaults.fontSize,
      textBold: state.defaults.textBold,
      strokeColor: state.defaults.strokeColor,
      strokeWidth: state.defaults.strokeWidth,
    };
    state.objects.push(newText);
    state.selectedIds = [id];
    recordHistory();
    updateInspector();
    render();
    // 右サイドバーのテキスト入力欄にフォーカス
    if (textContentInput) {
      requestAnimationFrame(() => {
        textContentInput.focus();
      });
    }
    return;
  }

  if (state.tool !== "select") {
    if (state.tool === "marker") {
      state.markerSnapAxis = null;
      state.markerSnapOrigin = null;
    }
    state.drawing = createObject(state.tool, point);
    render();
    return;
  }

  const handleHit = hitHandleForSelection(point);
  if (handleHit) {
    state.dragMode = {
      type: "resize",
      handle: handleHit.handle.name,
      targetId: handleHit.obj.id,
    };
    state.initialObjects = captureInitialObjects([handleHit.obj.id]);
    return;
  }

  const hit = hitTest(point);
  if (hit) {
    if (!state.selectedIds.includes(hit.id)) {
      state.selectedIds = [hit.id];
      updateInspector();
    }
    state.dragMode = { type: "move" };
    state.initialObjects = captureInitialObjects(state.selectedIds);
    render();
  } else {
    state.selectedIds = [];
    state.dragMode = { type: "select-box" };
    state.selectionRect = { x: point.x, y: point.y, w: 0, h: 0 };
    updateInspector();
    render();
  }
});

canvas.addEventListener("mousemove", (event) => {
  if (!state.pointerDown) {
    return;
  }
  const point = getCanvasPoint(event);
  if (state.drawing) {
    updateDrawing(point, event);
    render();
    return;
  }
  if (state.dragMode?.type === "select-box") {
    state.selectionRect = normalizeRect(
      state.startPoint.x,
      state.startPoint.y,
      point.x - state.startPoint.x,
      point.y - state.startPoint.y
    );
    render();
    return;
  }
  if (state.dragMode) {
    state.didDrag = true;
    updateObjectOnDrag(point);
    render();
  }
});

canvas.addEventListener("mouseup", () => {
  if (state.drawing) {
    finalizeDrawing();
    stopDrag();
    return;
  }
  if (state.dragMode?.type === "select-box") {
    finalizeSelectionBox();
    stopDrag();
    return;
  }
  if (state.didDrag) {
    recordHistory();
  }
  stopDrag();
});

canvas.addEventListener("mouseleave", () => {
  if (state.pointerDown && state.drawing) {
    finalizeDrawing();
  }
  if (state.dragMode?.type === "select-box") {
    finalizeSelectionBox();
  } else if (state.pointerDown && state.didDrag) {
    recordHistory();
  }
  stopDrag();
});

undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);

zoomOutBtn.addEventListener("click", () => zoomBy(-0.1));
zoomInBtn.addEventListener("click", () => zoomBy(0.1));
zoomResetBtn.addEventListener("click", fitZoom);

colorStrokeBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleColorPopover("stroke");
});

colorFillBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleColorPopover("fill");
});

colorTextBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleColorPopover("text");
});

colorStrokeCustomBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  closeColorPopover("stroke");
  openColorModal("stroke");
});

colorFillCustomBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  closeColorPopover("fill");
  openColorModal("fill");
});

colorTextCustomBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  closeColorPopover("text");
  openColorModal("text");
});

colorFillNoneBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  setFillColor("transparent", true);
  closeColorPopover("fill");
});

colorPicker.addEventListener("input", (event) => {
  const value = event.target.value.toUpperCase();
  colorHex.value = value;
  colorModalPreview.style.backgroundColor = value;
});

colorHex.addEventListener("input", (event) => {
  const normalized = normalizeHex(event.target.value);
  if (normalized) {
    colorPicker.value = normalized;
    colorModalPreview.style.backgroundColor = normalized;
  }
});

colorApplyBtn.addEventListener("click", applyCustomColor);
colorCancelBtn.addEventListener("click", closeColorModal);
colorModal.addEventListener("click", (event) => {
  if (event.target === colorModal) {
    closeColorModal();
  }
});

window.addEventListener("click", (event) => {
  if (!colorGroup.contains(event.target)) {
    closeColorPopover();
  }
});

toolButtons.forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

bindRangeNumber(strokeWidthRange, strokeWidthNumber, (value, commit) => {
  setStrokeWidth(value, commit);
});

bindRangeNumber(markerWidthRange, markerWidthNumber, (value, commit) => {
  setMarkerWidth(value, commit);
});

bindRangeNumber(markerOpacityRange, markerOpacityNumber, (value, commit) => {
  setMarkerOpacity(value, commit);
});

bindRangeNumber(textSizeRange, textSizeNumber, (value, commit) => {
  setTextSize(value, commit);
});

textBoldCheckbox.addEventListener("change", (event) => {
  setTextBold(event.target.checked, true);
});

if (textContentInput) {
  let textInputHistory = null;
  let isComposing = false;
  
  textContentInput.addEventListener("focus", () => {
    // フォーカス時に現在のテキストを保存（フォーカスした時点の状態）
    const selected = getSelected();
    if (selected && selected.type === "text") {
      const currentText = selected.text || "";
      textInputHistory = currentText;
      textContentInput.dataset.originalText = currentText;
    }
  });
  
  // IME変換開始
  textContentInput.addEventListener("compositionstart", () => {
    isComposing = true;
    textContentInput.dataset.composing = "true";
  });
  
  // IME変換中
  textContentInput.addEventListener("compositionupdate", () => {
    isComposing = true;
    textContentInput.dataset.composing = "true";
  });
  
  // IME変換終了
  textContentInput.addEventListener("compositionend", () => {
    isComposing = false;
    textContentInput.dataset.composing = "false";
    // 変換確定後にテキストを更新
    const selected = getSelected();
    if (selected && selected.type === "text") {
      selected.text = textContentInput.value;
      render();
    }
  });
  
  textContentInput.addEventListener("input", (event) => {
    // 変換中でない場合のみ更新
    if (!isComposing) {
      const selected = getSelected();
      if (selected && selected.type === "text") {
        selected.text = event.target.value;
        render();
      }
    }
  });
  
  textContentInput.addEventListener("blur", () => {
    // フォーカスが外れた時に確定
    const selected = getSelected();
    if (selected && selected.type === "text") {
      selected.text = textContentInput.value;
      recordHistory();
      render();
    }
    textInputHistory = null;
    isComposing = false;
  });
}

bindRangeNumber(arrowHeadRange, arrowHeadNumber, (value, commit) => {
  setHeadSize(value, commit);
});

window.addEventListener("keydown", (event) => {
  const active = document.activeElement;
  
  // テキスト入力欄がフォーカスされている時のEsc/Enter処理
  if (active === textContentInput) {
    // IME変換中はEnterキーの処理をスキップ
    const isComposing = textContentInput.dataset.composing === "true";
    
    if (event.key === "Escape") {
      const selected = getSelected();
      if (selected && selected.type === "text") {
        // Escでキャンセル（フォーカスした時点のテキストに戻す）
        event.preventDefault();
        const originalText = textContentInput.dataset.originalText !== undefined 
          ? textContentInput.dataset.originalText 
          : (textInputHistory !== null ? textInputHistory : "");
        selected.text = originalText;
        textContentInput.value = originalText;
        recordHistory();
        render();
        setTool("select");
        textContentInput.blur();
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !isComposing) {
      // Enterで確定してselectに戻る（変換中でない場合のみ）
      event.preventDefault();
      const selected = getSelected();
      if (selected && selected.type === "text") {
        selected.text = textContentInput.value;
        recordHistory();
        render();
        setTool("select");
        textContentInput.blur();
      }
      return;
    }
    // Shift+Enterは改行のため何もしない
    // 変換中のEnterはIMEに任せる
    return;
  }
  
  if (
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable)
  ) {
    return;
  }
  if (!state.isReady) {
    return;
  }

  if (event.key === "Escape") {
    if (!colorPopover.classList.contains("hidden")) {
      closeColorPopover();
      return;
    }
    if (state.drawing) {
      cancelDrawing();
      showToast("Cancelled");
    } else if (state.selectionRect) {
      state.selectionRect = null;
      render();
      showToast("Cancelled");
    } else if (state.selectedIds.length > 0) {
      clearSelection();
    } else if (state.tool !== "select") {
      setTool("select");
    }
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    copySelection();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
    event.preventDefault();
    pasteSelection();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && (event.key === "+" || event.key === "=")) {
    event.preventDefault();
    zoomBy(0.1);
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === "-") {
    event.preventDefault();
    zoomBy(-0.1);
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === "0") {
    event.preventDefault();
    fitZoom();
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    if (state.selectedIds.length > 0) {
      const selected = new Set(state.selectedIds);
      state.objects = state.objects.filter((obj) => !selected.has(obj.id));
      state.selectedIds = [];
      recordHistory();
      updateInspector();
      render();
    }
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    const key = event.key.toLowerCase();
    const map = {
      v: "select",
      r: "rect",
      o: "ellipse",
      a: "arrow",
      m: "marker",
      t: "text",
    };
    if (map[key]) {
      event.preventDefault();
      setTool(map[key]);
    }
  }
});

async function savePng() {
  if (!state.background) {
    return;
  }
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const exportCtx = exportCanvas.getContext("2d");
  exportCtx.drawImage(state.background, 0, 0);
  const layers = collectLayers(false);
  layers.markers.forEach((obj) => drawObject(obj, exportCtx));
  layers.shapes.forEach((obj) => drawObject(obj, exportCtx));
  layers.text.forEach((obj) => drawObject(obj, exportCtx));

  exportCanvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const timestamp = new Date();
    const fileBase = `${timestamp.getFullYear()}${String(
      timestamp.getMonth() + 1
    ).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}_${String(
      timestamp.getHours()
    ).padStart(2, "0")}${String(timestamp.getMinutes()).padStart(
      2,
      "0"
    )}${String(timestamp.getSeconds()).padStart(2, "0")}`;
    const fileName = `${fileBase}.png`;
    chrome.downloads.download(
      {
        url,
        filename: fileName,
        saveAs: false,
      },
      () => {
        fileNameEl.textContent = fileBase;
        showToast(`Saved: ${fileName}`);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    );
  }, "image/png");
}

saveBtn.addEventListener("click", savePng);

async function loadCapture() {
  const params = new URLSearchParams(window.location.search);
  const captureId = params.get("id");
  const stored = await storageArea.get(CAPTURE_KEY);
  const captures = stored[CAPTURE_KEY] || {};
  const capture = captures[captureId];

  if (!capture) {
    meta.textContent = "Capture not found. Please capture again.";
    showToast("Capture not found");
    return;
  }

  const image = new Image();
  image.onload = () => {
    let source = image;
    let width = image.width;
    let height = image.height;

    if (capture.crop) {
      const dpr = Number(capture.crop.dpr) || 1;
      const maxWidth = image.width;
      const maxHeight = image.height;
      const sx = Math.max(0, Math.round(capture.crop.x * dpr));
      const sy = Math.max(0, Math.round(capture.crop.y * dpr));
      const sw = Math.max(1, Math.round(capture.crop.width * dpr));
      const sh = Math.max(1, Math.round(capture.crop.height * dpr));
      const clampedWidth = Math.min(sw, maxWidth - sx);
      const clampedHeight = Math.min(sh, maxHeight - sy);
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = clampedWidth;
      cropCanvas.height = clampedHeight;
      const cropCtx = cropCanvas.getContext("2d");
      cropCtx.drawImage(
        image,
        sx,
        sy,
        clampedWidth,
        clampedHeight,
        0,
        0,
        clampedWidth,
        clampedHeight
      );
      source = cropCanvas;
      width = clampedWidth;
      height = clampedHeight;
    }

    state.background = source;
    canvas.width = width;
    canvas.height = height;
    applyZoom(1);
    render();
    recordHistory();
    updateInspector();
    setReady(true);
    updateHint();

    const capturedAt = new Date(capture.createdAt);
    meta.textContent = `Captured at ${capturedAt.toLocaleString()}`;
    const baseName = `${capturedAt.getFullYear()}${String(
      capturedAt.getMonth() + 1
    ).padStart(2, "0")}${String(capturedAt.getDate()).padStart(2, "0")}_${String(
      capturedAt.getHours()
    ).padStart(2, "0")}${String(capturedAt.getMinutes()).padStart(
      2,
      "0"
    )}${String(capturedAt.getSeconds()).padStart(2, "0")}`;
    fileNameEl.textContent = baseName;
  };
  image.onerror = () => {
    meta.textContent = "Capture failed to load.";
    showToast("Capture failed");
  };
  image.src = capture.dataUrl;
}

setTool("select");
setReady(false);
updateHint();
updateColorUI();
syncColorTargetFromContext();
loadCapture();
