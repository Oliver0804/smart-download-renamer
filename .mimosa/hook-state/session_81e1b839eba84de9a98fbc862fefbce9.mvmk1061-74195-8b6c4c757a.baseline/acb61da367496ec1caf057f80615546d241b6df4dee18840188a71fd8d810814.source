/*
 * 命名脈絡：把「頁面資訊 + 下載項目」組成 prompt。
 * buildSystemPrompt / buildUserContent 為純函式，可在 Node 單元測試。
 */
(function (global) {
  "use strict";

  const SDR = (global.SDR = global.SDR || {});

  const DEFAULT_PROMPT =
    "你是檔案命名助手。根據下方「下載時的頁面資訊」，為即將儲存的檔案取一個新檔名（只取主幹，不含副檔名）。" +
    "規則：1. 簡潔、具描述性、適合日後搜尋；2. 長度 5 到 60 個字元；" +
    "3. 語言{LANG_RULE}；4. 除非頁面資訊顯示日期重要，否則不要加日期；" +
    "5. 只輸出檔名本身一行，不要引號、不要句尾標點、不要任何說明或代碼。";

  const LANG_RULES = {
    auto: "跟隨頁面內容的主要語言（中文頁面取中文名、英文頁面取英文名）",
    zh: "一律使用繁體中文",
    en: "一律使用英文",
  };

  function buildSystemPrompt(settings) {
    const tpl =
      settings.prompt && String(settings.prompt).trim()
        ? String(settings.prompt).trim()
        : DEFAULT_PROMPT;
    const rule = LANG_RULES[settings.languageMode] || LANG_RULES.auto;
    return tpl.replace("{LANG_RULE}", rule);
  }

  function clip(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  function buildUserContent(pageContext, itemInfo, settings) {
    const lines = [];
    lines.push("原始檔名: " + (itemInfo.filename || "(未知)"));
    lines.push("下載網址: " + (itemInfo.url || ""));
    if (itemInfo.referrer) lines.push("來源頁面網址: " + itemInfo.referrer);
    if (itemInfo.mime) lines.push("檔案類型(MIME): " + itemInfo.mime);
    if (itemInfo.fileSize > 0) lines.push("檔案大小(bytes): " + itemInfo.fileSize);
    lines.push("");
    lines.push("下載時的頁面資訊：");
    if (pageContext) {
      if (pageContext.title) lines.push("頁面標題: " + clip(pageContext.title, 300));
      if (pageContext.h1) lines.push("頁面主標(H1): " + clip(pageContext.h1, 200));
      if (pageContext.metaDescription) lines.push("頁面描述: " + clip(pageContext.metaDescription, 300));
      if (pageContext.anchorText) lines.push("被點擊連結的文字: " + clip(pageContext.anchorText, 200));
      if (settings.includePageText && pageContext.excerpt) {
        const limit = settings.pageTextLimit || 2000;
        lines.push("頁面文字節錄: " + clip(pageContext.excerpt, limit));
      }
      if (pageContext.pageUrl) lines.push("頁面網址: " + pageContext.pageUrl);
    } else {
      lines.push("(無法取得頁面內容，僅依網址與原始檔名判斷)");
    }
    return lines.join("\n");
  }

  SDR.context = { DEFAULT_PROMPT, LANG_RULES, buildSystemPrompt, buildUserContent };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SDR.context;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
