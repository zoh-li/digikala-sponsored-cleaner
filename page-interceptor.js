(() => {
  "use strict";

  const SEARCH_API_PATTERN = /\/discovery\/api\/v2\/search(?:[/?#]|$)/i;
  const ENABLED_ATTRIBUTE = "data-dk-cleaner-enabled";
  const API_TOTAL_ATTRIBUTE = "data-dk-cleaner-api-total";
  const STORAGE_MIRROR_KEY = "dkSponsoredCleanerEnabled";
  const FILTERED_EVENT = "dk-sponsored-cleaner-filtered";
  const filteredAdIds = new Set();

  function isEnabled() {
    const attribute = document.documentElement?.getAttribute(ENABLED_ATTRIBUTE);
    if (attribute === "true" || attribute === "false") return attribute === "true";

    try {
      return localStorage.getItem(STORAGE_MIRROR_KEY) !== "false";
    } catch {
      return true;
    }
  }

  function isSearchRequest(url) {
    return typeof url === "string" && SEARCH_API_PATTERN.test(url);
  }

  function adIdentity(widget) {
    const data = widget?.data || {};
    const properties = data.properties || {};
    const ad = properties.ad || {};
    const productId = data.id || data.product_id || data.url?.params?.[0]?.product_id;
    return String(ad.id || ad.variant_id || productId || properties.ad_url || "unknown-ad");
  }

  function isSponsoredProduct(widget) {
    const properties = widget?.data?.properties;
    return Boolean(
      properties &&
      (properties.is_ad === true || (properties.ad && properties.ad_url))
    );
  }

  function announceFilteredAds() {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute(API_TOTAL_ATTRIBUTE, String(filteredAdIds.size));
    document.dispatchEvent(new Event(FILTERED_EVENT));
  }

  function filterProductListings(payload) {
    let changed = false;
    const visited = new WeakSet();

    function visit(node) {
      if (!node || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);

      if (
        node.type === "vertical_product_listing" &&
        Array.isArray(node.data?.widgets)
      ) {
        const original = node.data.widgets;
        const organic = [];

        for (const widget of original) {
          if (isSponsoredProduct(widget)) {
            filteredAdIds.add(adIdentity(widget));
            changed = true;
          } else {
            organic.push(widget);
          }
        }

        if (organic.length !== original.length) node.data.widgets = organic;
      }

      if (Array.isArray(node)) {
        for (const child of node) visit(child);
      } else {
        for (const child of Object.values(node)) visit(child);
      }
    }

    visit(payload);
    if (changed) announceFilteredAds();
    return changed;
  }

  function patchFetch() {
    if (typeof window.fetch !== "function") return;
    const nativeFetch = window.fetch;

    window.fetch = async function patchedFetch(...args) {
      const response = await nativeFetch.apply(this, args);
      if (!isEnabled() || !isSearchRequest(response.url)) return response;

      try {
        const payload = await response.clone().json();
        if (!filterProductListings(payload)) return response;

        const headers = new Headers(response.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        const replacement = new Response(JSON.stringify(payload), {
          status: response.status,
          statusText: response.statusText,
          headers
        });

        for (const [property, value] of [
          ["url", response.url],
          ["redirected", response.redirected],
          ["type", response.type]
        ]) {
          try {
            Object.defineProperty(replacement, property, { value });
          } catch {

          }
        }

        return replacement;
      } catch {
        return response;
      }
    };
  }

  function patchXmlHttpRequest() {
    if (typeof XMLHttpRequest !== "function") return;

    const prototype = XMLHttpRequest.prototype;
    const nativeOpen = prototype.open;
    const nativeSend = prototype.send;
    const responseTextDescriptor = Object.getOwnPropertyDescriptor(prototype, "responseText");
    const responseDescriptor = Object.getOwnPropertyDescriptor(prototype, "response");
    const requestUrls = new WeakMap();
    const modifiedTexts = new WeakMap();
    const modifiedJson = new WeakMap();

    if (!responseTextDescriptor?.get || !responseDescriptor?.get) return;

    Object.defineProperty(prototype, "responseText", {
      configurable: responseTextDescriptor.configurable,
      enumerable: responseTextDescriptor.enumerable,
      get() {
        if (modifiedTexts.has(this)) return modifiedTexts.get(this);
        return responseTextDescriptor.get.call(this);
      }
    });

    Object.defineProperty(prototype, "response", {
      configurable: responseDescriptor.configurable,
      enumerable: responseDescriptor.enumerable,
      get() {
        if (modifiedJson.has(this)) return modifiedJson.get(this);
        if (modifiedTexts.has(this)) return modifiedTexts.get(this);
        return responseDescriptor.get.call(this);
      }
    });

    prototype.open = function patchedOpen(method, url, ...rest) {
      requestUrls.set(this, String(url));
      return nativeOpen.call(this, method, url, ...rest);
    };

    prototype.send = function patchedSend(...args) {
      const request = this;

      function filterCompletedResponse() {
        if (
          request.readyState !== XMLHttpRequest.DONE ||
          !isEnabled() ||
          !isSearchRequest(requestUrls.get(request))
        ) return;

        try {
          if (request.responseType === "json") {
            const payload = responseDescriptor.get.call(request);
            if (filterProductListings(payload)) modifiedJson.set(request, payload);
            return;
          }

          if (request.responseType === "" || request.responseType === "text") {
            const originalText = responseTextDescriptor.get.call(request);
            const payload = JSON.parse(originalText);
            if (filterProductListings(payload)) {
              modifiedTexts.set(request, JSON.stringify(payload));
            }
          }
        } catch {

        }
      }

      request.addEventListener("readystatechange", filterCompletedResponse, true);
      return nativeSend.apply(request, args);
    };
  }

  patchFetch();
  patchXmlHttpRequest();
})();
