"use strict";

const toggle = document.getElementById("enabled-toggle");
const statusTitle = document.getElementById("status-title");
const statusDescription = document.getElementById("status-description");
const hiddenCount = document.getElementById("hidden-count");
const totalCount = document.getElementById("total-count");
const pageMessage = document.getElementById("page-message");
const githubLink = document.getElementById("github-link");
const githubNote = document.getElementById("github-note");
const GITHUB_REPOSITORY_URL = "https://github.com/zoh-li/digikala-sponsored-cleaner";

function persianNumber(value) {
  return new Intl.NumberFormat("fa-IR").format(Number(value) || 0);
}

function renderEnabled(enabled) {
  toggle.checked = enabled;
  statusTitle.textContent = enabled ? "فیلتر فعال است" : "فیلتر خاموش است";
  statusDescription.textContent = enabled
    ? "تبلیغات سفارشی مخفی می‌شوند"
    : "همهٔ محصولات نمایش داده می‌شوند";
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshState() {
  const { cleanerEnabled = true } = await chrome.storage.local.get({ cleanerEnabled: true });
  renderEnabled(cleanerEnabled !== false);

  try {
    const tab = await activeTab();
    const response = await chrome.tabs.sendMessage(tab.id, { type: "DK_CLEANER_GET_STATE" });
    hiddenCount.textContent = persianNumber(response.currentHidden);
    totalCount.textContent = persianNumber(response.totalDetected);
    pageMessage.textContent = response.enabled
      ? "صفحه پاک‌سازی شده و محصولات جدید هم بررسی می‌شوند."
      : "فیلتر موقتاً خاموش است.";
    pageMessage.className = response.enabled ? "message success" : "message warning";
  } catch {
    hiddenCount.textContent = "0";
    totalCount.textContent = "0";
    pageMessage.textContent = "برای استفاده, یکی از صفحه‌های دیجی‌کالا را باز کنید.";
    pageMessage.className = "message warning";
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
    setTimeout(refreshState, 80);
  }
});

refreshState();
