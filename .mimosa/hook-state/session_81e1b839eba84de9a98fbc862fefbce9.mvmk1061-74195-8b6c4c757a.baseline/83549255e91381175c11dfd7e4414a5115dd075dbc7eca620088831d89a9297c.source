/*
 * 檔名清理：模型輸出 → 合法、安全、跨平台的檔名。
 * 純函式，無瀏覽器相依，可在 Node 執行單元測試。
 */
(function (global) {
  "use strict";

  const SDR = (global.SDR = global.SDR || {});

  // Windows/macOS 檔名非法字元與控制字元
  const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
  // Windows 保留名稱
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  const MAX_STEM = 100;

  // 常見 MIME → 副檔名（僅在原始檔名缺副檔名時補用）
  const MIME_EXT = {
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "application/gzip": "gz",
    "application/x-tar": "tar",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/json": "json",
    "text/csv": "csv",
    "text/plain": "txt",
    "text/html": "html",
    "text/markdown": "md",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };

  function sanitizeStem(raw, maxLen = MAX_STEM) {
    if (typeof raw !== "string") return null;
    let s = raw
      .replace(/```[\s\S]*?```/g, " ") // 整段 code fence
      .replace(ILLEGAL, " ")
      .replace(/\s+/g, " ")
      .replace(/^[.\s]+|[.\s]+$/g, ""); // 去首尾空白與點
    if (!s) return null;
    if (RESERVED.test(s)) s = "_" + s;
    // 以 code point 截斷，避免切到 surrogate pair
    const chars = Array.from(s);
    if (chars.length > maxLen) s = chars.slice(0, maxLen).join("").trim();
    return s || null;
  }

  function splitFilename(name) {
    if (typeof name !== "string" || !name) return { stem: "", ext: "" };
    const base = name.split(/[\\/]/).pop(); // 保險：只取最後一段
    const i = base.lastIndexOf(".");
    // 副檔名 ≤ 10 字元且不是隱藏檔（如 .gitignore）
    if (i > 0 && i >= base.length - 11) {
      return { stem: base.slice(0, i), ext: base.slice(i + 1) };
    }
    return { stem: base, ext: "" };
  }

  function extFromMime(mime) {
    if (typeof mime !== "string" || !mime) return "";
    return MIME_EXT[mime.split(";")[0].trim().toLowerCase()] || "";
  }

  // 產生最終檔名；無法產生時回 null（呼叫端退回原下載）
  function buildFilename(rawStem, originalFilename, mime) {
    const orig = splitFilename(originalFilename || "");
    let ext = (orig.ext || extFromMime(mime)).toLowerCase().replace(/[^a-z0-9]/g, "");
    let stem = sanitizeStem(rawStem);
    if (!stem) return null;
    // 模型有時會連副檔名一起回覆，剝除與目標重複的尾巴避免雙重副檔名
    if (ext && stem.toLowerCase().endsWith("." + ext)) {
      stem = stem.slice(0, -(ext.length + 1)).replace(/\s+$/, "");
    }
    if (!stem) return null;
    return ext ? stem + "." + ext : stem;
  }

  SDR.sanitize = { sanitizeStem, splitFilename, extFromMime, buildFilename };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SDR.sanitize;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
