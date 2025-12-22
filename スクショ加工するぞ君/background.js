const CAPTURE_KEY = "captures";
const MENU_CAPTURE_VISIBLE = "capture-visible";
const MENU_CAPTURE_REGION = "capture-region";

const storageArea = chrome.storage.session || chrome.storage.local;

async function storeCapture(dataUrl, crop) {
  const captureId =
    (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const capture = {
    id: captureId,
    dataUrl,
    crop: crop || null,
    createdAt: Date.now(),
  };

  const existing = await storageArea.get(CAPTURE_KEY);
  const captures = existing[CAPTURE_KEY] || {};
  captures[captureId] = capture;
  await storageArea.set({ [CAPTURE_KEY]: captures });

  return captureId;
}

async function captureAndOpenEditor(options = {}) {
  try {
    const windowId = options.windowId;
    const crop = options.crop;
    const dataUrl =
      windowId === undefined || windowId === null
        ? await chrome.tabs.captureVisibleTab({ format: "png" })
        : await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    const captureId = await storeCapture(dataUrl, crop);
    const url = chrome.runtime.getURL(`editor.html?id=${captureId}`);
    await chrome.tabs.create({ url });
  } catch (error) {
    console.error("Capture failed", error);
  }
}

chrome.action.onClicked.addListener(() => {
  captureAndOpenEditor();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "capture-visible") {
    captureAndOpenEditor();
  }
  if (command === "capture-region") {
    startRegionSelection();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_CAPTURE_VISIBLE,
      title: "Capture visible tab",
      contexts: ["all"],
    });
    chrome.contextMenus.create({
      id: MENU_CAPTURE_REGION,
      title: "Capture selection",
      contexts: ["all"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_CAPTURE_VISIBLE) {
    captureAndOpenEditor({ windowId: tab?.windowId });
  }
  if (info.menuItemId === MENU_CAPTURE_REGION) {
    startRegionSelection();
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "REGION_SELECTED") {
    captureAndOpenEditor({
      windowId: sender.tab?.windowId,
      crop: message.region,
    });
  }
  if (message?.type === "CANCEL_REGION") {
    return;
  }
});

async function startRegionSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["selection.js"],
    });
  } catch (error) {
    console.error("Selection overlay failed", error);
  }
}
