"use strict";

const app = document.querySelector(".app");
const toggle = document.getElementById("enabled-toggle");
const statusLabel = document.getElementById("status-label");
const statusTitle = document.getElementById("status-title");
const statusDescription = document.getElementById("status-description");
const hiddenCount = document.getElementById("hidden-count");
const totalCount = document.getElementById("total-count");
const pageStatus = document.getElementById("page-status");
const pageMessage = document.getElementById("page-message");
const extensionIcon = document.getElementById("extension-icon");
const githubLink = document.getElementById("github-link");
const githubNote = document.getElementById("github-note");

const GITHUB_REPOSITORY_URL = "https://github.com/zoh-li/digikala-sponsored-cleaner/tree/main";
const numberFormatter = new Intl.NumberFormat("en-US");

function englishNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function renderEnabled(enabled) {
  toggle.checked = enabled;
  toggle.setAttribute("aria-checked", String(enabled));
  app.dataset.enabled = String(enabled);
  extensionIcon.src = enabled ? "icons/icon-128-on.png" : "icons/icon-128-off.png";
  statusLabel.textContent = enabled ? "محافظت فعال" : "محافظت متوقف";
  statusTitle.textContent = enabled ? "فیلتر روشن است" : "فیلتر خاموش است";
  statusDescription.textContent = enabled
    ? "محصولات سفارشی خودکار حذف می‌شوند."
    : "همهٔ محصولات نمایش داده می‌شوند.";

  if (!enabled) hidePageStatus();
}

function renderCounts(currentHidden = 0, totalDetected = 0) {
  hiddenCount.textContent = englishNumber(currentHidden);
  totalCount.textContent = englishNumber(totalDetected);
}

function showPageStatus(state, message) {
  pageStatus.hidden = false;
  pageStatus.dataset.state = state;
  pageMessage.textContent = message;
}

function hidePageStatus() {
  pageStatus.hidden = true;
  pageStatus.removeAttribute("data-state");
  pageMessage.textContent = "";
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Active tab is unavailable");
  return tab;
}

async function refreshState() {
  const { cleanerEnabled = true } = await chrome.storage.local.get({ cleanerEnabled: true });
  const enabled = cleanerEnabled !== false;
  renderEnabled(enabled);

  if (enabled) showPageStatus("loading", "در حال بررسی صفحه…");

  try {
    const tab = await activeTab();
    const response = await chrome.tabs.sendMessage(tab.id, { type: "DK_CLEANER_GET_STATE" });
    const responseEnabled = response.enabled !== false;

    renderCounts(response.currentHidden, response.totalDetected);
    renderEnabled(responseEnabled);

    if (responseEnabled) {
      showPageStatus("success", "صفحه پاک‌سازی شد و نتایج جدید نیز بررسی می‌شوند.");
    }
  } catch {
    renderCounts();
    if (enabled) {
      showPageStatus("warning", "یکی از صفحه‌های دیجی‌کالا را باز کنید.");
    } else {
      hidePageStatus();
    }
  }
}

function openGithubRepository() {
  chrome.tabs.create({ url: GITHUB_REPOSITORY_URL });
}

githubLink.addEventListener("click", openGithubRepository);
githubNote.addEventListener("click", openGithubRepository);

toggle.addEventListener("change", async () => {
  const enabled = toggle.checked;
  renderEnabled(enabled);
  toggle.disabled = true;
  app.setAttribute("aria-busy", "true");

  if (enabled) {
    showPageStatus("loading", "در حال فعال‌کردن پاک‌ساز…");
  } else {
    hidePageStatus();
  }

  await chrome.storage.local.set({ cleanerEnabled: enabled });

  try {
    const tab = await activeTab();
    await chrome.tabs.sendMessage(tab.id, {
      type: "DK_CLEANER_SET_ENABLED",
      enabled
    });
    await chrome.tabs.reload(tab.id);
    window.close();
  } catch {
    toggle.disabled = false;
    app.removeAttribute("aria-busy");
    setTimeout(refreshState, 80);
  }
});

refreshState();
