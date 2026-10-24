/*
 * 內容腳本：被動回應背景的頁面脈絡請求，不主動做任何事。
 */
(function () {
  "use strict";

  const api = globalThis.browser || globalThis.chrome;

  function textOf(el) {
    return el ? String(el.innerText || el.textContent || "").trim() : "";
  }

  // 在頁面中找出指向下載 URL 的連結文字（完全比對 → 以檔名結尾的寬鬆比對）
  function findAnchorText(downloadUrl, downloadBasename) {
    let target = null;
    try {
      target = new URL(downloadUrl, location.href);
    } catch (_) {
      return null;
    }
    let loose = null;
    for (const a of document.querySelectorAll("a[href]")) {
      let u;
      try {
        u = new URL(a.href, location.href);
      } catch (_) {
        continue;
      }
      if (u.origin === target.origin && u.pathname === target.pathname && u.search === target.search) {
        const t = textOf(a);
        if (t) return t.slice(0, 200);
      }
      if (!loose && downloadBasename && u.pathname.endsWith("/" + downloadBasename)) {
        const t = textOf(a);
        if (t) loose = t;
      }
    }
    return loose;
  }

  // 主要文字區塊節錄：優先語意容器，否則取文字最多的候選
  function pickExcerpt(limit) {
    const selectors = [
      "article",
      "main",
      '[role="main"]',
      "#content",
      ".content",
      "#main",
      ".post",
      ".article",
    ];
    let best = "";
    for (const sel of selectors) {
      const t = textOf(document.querySelector(sel));
      if (t.length > best.length) best = t;
    }
    if (best.length < 200 && document.body) {
      const body = textOf(document.body);
      if (body.length > best.length) best = body;
    }
    return best.replace(/\s+/g, " ").trim().slice(0, limit || 2000);
  }

  api.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "SDR_GET_CONTEXT") return;
    return Promise.resolve({
      title: document.title || "",
      h1: textOf(document.querySelector("h1")).slice(0, 300),
      metaDescription: String(
        (document.querySelector('meta[name="description"]') || {}).content || ""
      ).trim(),
      pageUrl: location.href,
      anchorText: findAnchorText(msg.downloadUrl, msg.downloadBasename),
      excerpt: msg.includePageText ? pickExcerpt(msg.pageTextLimit) : "",
    });
  });
})();
