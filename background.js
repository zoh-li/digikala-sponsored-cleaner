"use strict";

const ICONS_ON = {
  16: "icons/icon-16-on.png",
  32: "icons/icon-32-on.png",
  48: "icons/icon-48-on.png",
  128: "icons/icon-128-on.png"
};

const ICONS_OFF = {
  16: "icons/icon-16-off.png",
  32: "icons/icon-32-off.png",
  48: "icons/icon-48-off.png",
  128: "icons/icon-128-off.png"
};

async function updateExtensionIcon(enabled) {
  await chrome.action.setIcon({
    path: enabled ? ICONS_ON : ICONS_OFF
  });

  await chrome.action.setTitle({
    title: enabled
      ? "Digikala sponsored cleaner — ON"
      : "Digikala sponsored cleaner — OFF"
  });

  await chrome.action.setBadgeText({
    text: enabled ? "" : "OFF"
  });
}

async function syncExtensionIcon() {
  const { cleanerEnabled = true } =
    await chrome.storage.sync.get({ cleanerEnabled: true });

  await updateExtensionIcon(cleanerEnabled !== false);
}

chrome.runtime.onInstalled.addListener(() => {
  syncExtensionIcon();
});

chrome.runtime.onStartup.addListener(() => {
  syncExtensionIcon();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.cleanerEnabled) {
    return;
  }

  updateExtensionIcon(changes.cleanerEnabled.newValue !== false);
});

syncExtensionIcon();