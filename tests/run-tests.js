/*
 * 單元測試：node tests/run-tests.js
 * 覆蓋 lib/sanitize.js 與 lib/context.js 的純函式。
 */
"use strict";

const assert = require("node:assert");
const sanitize = require("../lib/sanitize.js");
const context = require("../lib/context.js");

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (e) {
    console.error("  ✗ " + name + "\n    " + (e && e.message));
    process.exitCode = 1;
  }
}

console.log("sanitize.js");

t("移除非法字元", () => {
  assert.strictEqual(sanitize.sanitizeStem('report<>:"/\\|?*2024'), "report 2024");
});

t("移除控制字元（以空白取代）並壓縮空白", () => {
  assert.strictEqual(sanitize.sanitizeStem("a\u0000b\u001fc  d"), "a b c d");
});

t("去首尾空白與點", () => {
  assert.strictEqual(sanitize.sanitizeStem("  .report. "), "report");
});

t("Windows 保留名稱加底線", () => {
  assert.strictEqual(sanitize.sanitizeStem("con"), "_con");
  assert.strictEqual(sanitize.sanitizeStem("COM1"), "_COM1");
});

t("空值回 null", () => {
  assert.strictEqual(sanitize.sanitizeStem(""), null);
  assert.strictEqual(sanitize.sanitizeStem("   "), null);
  assert.strictEqual(sanitize.sanitizeStem(null), null);
  assert.strictEqual(sanitize.sanitizeStem(123), null);
});

t("長度以 code point 截斷（含 emoji）", () => {
  const s = sanitize.sanitizeStem("報告" + "a".repeat(120) + "😀😀😀");
  assert.strictEqual(Array.from(s).length, 100);
});

t("splitFilename：一般檔名", () => {
  assert.deepStrictEqual(sanitize.splitFilename("report.pdf"), { stem: "report", ext: "pdf" });
});

t("splitFilename：含路徑只取最後一段", () => {
  assert.deepStrictEqual(sanitize.splitFilename("a/b/c/file.zip"), { stem: "file", ext: "zip" });
});

t("splitFilename：隱藏檔不算副檔名", () => {
  assert.deepStrictEqual(sanitize.splitFilename(".gitignore"), { stem: ".gitignore", ext: "" });
});

t("splitFilename：多點檔名取最後一段", () => {
  assert.deepStrictEqual(sanitize.splitFilename("archive.tar.gz"), { stem: "archive.tar", ext: "gz" });
});

t("extFromMime：含參數與大小寫", () => {
  assert.strictEqual(sanitize.extFromMime("Application/PDF; charset=binary"), "pdf");
  assert.strictEqual(sanitize.extFromMime("unknown/type"), "");
  assert.strictEqual(sanitize.extFromMime(""), "");
});

t("buildFilename：中文主幹 + 原副檔名", () => {
  assert.strictEqual(sanitize.buildFilename("季度報告 v2", "download.pdf", ""), "季度報告 v2.pdf");
});

t("buildFilename：無副檔名時用 MIME 補", () => {
  assert.strictEqual(sanitize.buildFilename("data", "file", "application/zip"), "data.zip");
});

t("buildFilename：模型多給副檔名也會被清掉", () => {
  assert.strictEqual(sanitize.buildFilename("report.pdf", "orig.pdf", ""), "report.pdf");
});

t("buildFilename：無效輸入回 null", () => {
  assert.strictEqual(sanitize.buildFilename("///", "a.pdf", ""), null);
});

console.log("context.js");

const baseSettings = {
  prompt: "",
  languageMode: "auto",
  includePageText: true,
  pageTextLimit: 2000,
};

t("預設 prompt：auto 語言規則", () => {
  const p = context.buildSystemPrompt(baseSettings);
  assert.ok(p.includes("跟隨頁面內容"), "應含 auto 規則");
  assert.ok(!p.includes("{LANG_RULE}"), "不應殘留佔位符");
});

t("語言模式 zh/en", () => {
  assert.ok(context.buildSystemPrompt({ ...baseSettings, languageMode: "zh" }).includes("繁體中文"));
  assert.ok(context.buildSystemPrompt({ ...baseSettings, languageMode: "en" }).includes("英文"));
});

t("自訂 prompt 覆蓋並替換佔位符", () => {
  const p = context.buildSystemPrompt({ ...baseSettings, prompt: "自訂 {LANG_RULE}" });
  assert.ok(p.startsWith("自訂 "));
  assert.ok(!p.includes("{LANG_RULE}"));
});

t("user content 含基本欄位", () => {
  const s = context.buildUserContent(
    { title: "T", pageUrl: "https://a/", anchorText: "下載" },
    { filename: "f.pdf", url: "https://a/f.pdf", referrer: "https://a/", mime: "application/pdf", fileSize: 10 },
    baseSettings
  );
  assert.ok(s.includes("f.pdf") && s.includes("https://a/f.pdf") && s.includes("application/pdf"));
  assert.ok(s.includes("下載") && s.includes("頁面標題: T"));
});

t("includePageText=false 時不含節錄", () => {
  const s = context.buildUserContent(
    { title: "T", excerpt: "BODY_TEXT" },
    { filename: "f", url: "u" },
    { ...baseSettings, includePageText: false }
  );
  assert.ok(!s.includes("BODY_TEXT"));
});

t("節錄依 pageTextLimit 截斷", () => {
  const s = context.buildUserContent(
    { title: "T", excerpt: "x".repeat(3000) },
    { filename: "f", url: "u" },
    { ...baseSettings, pageTextLimit: 100 }
  );
  assert.ok(s.includes("x".repeat(100) + "…"));
  assert.ok(!s.includes("x".repeat(150)));
});

t("pageContext 為 null 也不會丟例外", () => {
  const s = context.buildUserContent(null, { filename: "f", url: "u" }, baseSettings);
  assert.ok(s.includes("無法取得頁面內容"));
});

console.log("\n" + passed + " 個測試通過" + (process.exitCode ? "（有失敗）" : ""));
