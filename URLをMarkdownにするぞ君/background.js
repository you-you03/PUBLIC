'use strict';

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('popup.html');

  const existingTabs = await chrome.tabs.query({ url });
  if (existingTabs.length > 0) {
    const target = existingTabs[0];
    await chrome.windows.update(target.windowId, { focused: true, state: 'normal' });
    await chrome.tabs.update(target.id, { active: true });
    return;
  }

  await chrome.windows.create({
    url,
    type: 'popup',
    width: 420,
    height: 720,
    left: 100,
    top: 100,
    focused: true,
    state: 'normal',
  });
});
