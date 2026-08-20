(() => {
  "use strict";

  const HIDDEN_ATTRIBUTE = "data-dk-clean-sponsored-hidden";
  const PRODUCT_CARD_SELECTOR = '[data-testid="product-card"]';
  const PRODUCT_LINK_SELECTOR = 'a[href*="/product/dkp-"]';
  const STYLE_ID = "dk-sponsored-cleaner-style";
  const ENABLED_ATTRIBUTE = "data-dk-cleaner-enabled";
  const API_TOTAL_ATTRIBUTE = "data-dk-cleaner-api-total";
  const STORAGE_MIRROR_KEY = "dkSponsoredCleanerEnabled";
  const FILTERED_EVENT = "dk-sponsored-cleaner-filtered";

  let enabled = true;
  let scanScheduled = false;
  let totalDetected = 0;
  const detectedAds = new Set();

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${HIDDEN_ATTRIBUTE}="true"] {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function normalizeText(value) {
    return (value || "")
      .replace(/[\u200c\u200d\u200e\u200f\ufeff]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasAdQueryParameter(link) {
    const rawHref = link.getAttribute("href") || "";
    if (/(?:[?&]|&amp;)ad_variant_id(?:=|&|$)/i.test(rawHref)) return true;

    try {
      return new URL(link.href, location.href).searchParams.has("ad_variant_id");
    } catch {
      return false;
    }
  }

  function hasAdIcon(card) {
    return Array.from(card.querySelectorAll("use")).some((element) => {
      const reference =
        element.getAttribute("href") ||
        element.getAttribute("xlink:href") ||
        element.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
        "";
      return reference.toLowerCase().endsWith("#ads");
    });
  }

  function hasSponsoredLabel(card) {
    return Array.from(card.querySelectorAll("span")).some(
      (span) => normalizeText(span.textContent) === "سفارشی"
    );
  }

  function isSponsored(card, link) {

    return hasAdQueryParameter(link) || (hasSponsoredLabel(card) && hasAdIcon(card));
  }

  function getOuterCard(card, link) {
    return link.closest("article") || card.closest("article") || link;
  }

  function adIdentity(link) {
    try {
      const url = new URL(link.href, location.href);
      return (
        url.searchParams.get("ad_variant_id") ||
        url.searchParams.get("product_id") ||
        url.pathname
      );
    } catch {
      return link.getAttribute("href") || "unknown";
    }
  }

  function processCard(card) {
    const link = card.closest(PRODUCT_LINK_SELECTOR) || card.querySelector(PRODUCT_LINK_SELECTOR);
    if (!link) return;

    const outerCard = getOuterCard(card, link);
    const sponsored = isSponsored(card, link);
    const shouldHide = enabled && sponsored;

    if (shouldHide) {
      outerCard.setAttribute(HIDDEN_ATTRIBUTE, "true");
      const identity = adIdentity(link);
      if (!detectedAds.has(identity)) {
        detectedAds.add(identity);
        totalDetected += 1;
      }
    } else {
      outerCard.removeAttribute(HIDDEN_ATTRIBUTE);
    }
  }

  function scan(root = document) {
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

    if (root.matches?.(PRODUCT_CARD_SELECTOR)) processCard(root);
    root.querySelectorAll?.(PRODUCT_CARD_SELECTOR).forEach(processCard);
  }

  function currentHiddenCount() {
    const domHidden = document.querySelectorAll(`[${HIDDEN_ATTRIBUTE}="true"]`).length;
    const apiHidden = Number(document.documentElement.getAttribute(API_TOTAL_ATTRIBUTE)) || 0;
    return domHidden + apiHidden;
  }

  function reportState() {
    return {
      enabled,
      currentHidden: currentHiddenCount(),
      totalDetected: totalDetected + (Number(document.documentElement.getAttribute(API_TOTAL_ATTRIBUTE)) || 0),
      supported: true
    };
  }

  function scheduleScan(root = document) {
    if (scanScheduled) return;
    scanScheduled = true;

    requestAnimationFrame(() => {
      scanScheduled = false;
      scan(root.isConnected === false ? document : root);
    });
  }

  function revealEverything() {
    document
      .querySelectorAll(`[${HIDDEN_ATTRIBUTE}]`)
      .forEach((element) => element.removeAttribute(HIDDEN_ATTRIBUTE));
  }

  function mirrorEnabledState(value) {
    document.documentElement.setAttribute(ENABLED_ATTRIBUTE, String(value));
    try {
      localStorage.setItem(STORAGE_MIRROR_KEY, String(value));
    } catch {
      
    }
  }

  installStyle();

  chrome.storage.local.get({ cleanerEnabled: true }, ({ cleanerEnabled }) => {
    enabled = cleanerEnabled !== false;
    mirrorEnabledState(enabled);
    scheduleScan(document);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.cleanerEnabled) return;
    enabled = changes.cleanerEnabled.newValue !== false;
    mirrorEnabledState(enabled);
    if (enabled) scheduleScan(document);
    else revealEverything();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "DK_CLEANER_GET_STATE") {
      sendResponse(reportState());
    }
    if (message?.type === "DK_CLEANER_SET_ENABLED") {
      enabled = message.enabled !== false;
      mirrorEnabledState(enabled);
      if (enabled) scheduleScan(document);
      else revealEverything();
      sendResponse(reportState());
    }
  });

  document.addEventListener(FILTERED_EVENT, () => {
    
  });

  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;

    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        const element = mutation.target.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : document;
        scheduleScan(element);
        return;
      }

      if (mutation.type === "attributes") {
        scheduleScan(mutation.target.closest?.(PRODUCT_CARD_SELECTOR) || document);
        return;
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "xlink:href"]
  });
})();
