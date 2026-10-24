/*
 * AMO 商店頁更新腳本：用 AMO API v5 更新 listing 的名稱、摘要、描述、連結與分類。
 * 憑證只從環境變數讀取，不寫進任何檔案。
 *
 * 注意：AMO API（v3/v4/v5）沒有截圖上傳端點，截圖請到
 * https://addons.mozilla.org/developers/addon/smart-download-renamer-openrou/edit
 * 手動上傳 screenshots/ 目錄裡的圖片。
 *
 * 用法：AMO_API_KEY=<issuer> AMO_API_SECRET=<secret> node scripts/amo-update-listing.js
 */
"use strict";

const crypto = require("node:crypto");

const SLUG = "smart-download-renamer-openrou";
const API = "https://addons.mozilla.org/api/v5";

const ISSUER = process.env.AMO_API_KEY;
const SECRET = process.env.AMO_API_SECRET;
if (!ISSUER || !SECRET) {
  console.error("請設定 AMO_API_KEY 與 AMO_API_SECRET 環境變數");
  process.exit(1);
}

function makeJwt() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ iss: ISSUER, jti: crypto.randomBytes(12).toString("hex"), iat: now - 5, exp: now + 240 });
  const sig = crypto.createHmac("sha256", SECRET).update(head + "." + payload).digest("base64url");
  return head + "." + payload + "." + sig;
}

async function amoFetch(pathname, options = {}) {
  const res = await fetch(API + pathname, {
    ...options,
    headers: { Authorization: "JWT " + makeJwt(), ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_) {
    body = text.slice(0, 500);
  }
  if (!res.ok) {
    throw new Error("AMO " + res.status + " " + pathname + ": " + JSON.stringify(body).slice(0, 800));
  }
  return body;
}

const REPO = "https://github.com/Oliver0804/smart-download-renamer";

const SUMMARY = {
  "en-US":
    "Automatically rename downloads based on the page you downloaded from, using any OpenRouter model. Falls back to the original name on any failure.",
  "zh-TW":
    "下載檔案時，自動依「下載當下頁面的內容與 URL」由 OpenRouter 模型預測具描述性的新檔名；任何一步失敗都會保留原始檔名，不會弄丟下載。",
};

const DESCRIPTION = {
  "en-US": [
    "Smart Download Renamer pauses each download, reads the page you downloaded from (title, headings, link text, optional page text), asks an OpenRouter model for a descriptive filename, then re-downloads the file under the new name.",
    "",
    "Firefox has no API for renaming downloads at save time, so this add-on uses a cancel-and-redownload flow with full fallbacks: every failure path restores the original download, so a file is never lost.",
    "",
    "Features:",
    "- Works with any OpenRouter model (default openai/gpt-oss-20b, ~$0.00003 per rename)",
    "- Filename language follows the page language (or force Chinese/English)",
    "- Custom naming prompt",
    "- Diagnostics panel in the options page shows exactly what happened to each download",
    "- POST form and blob: downloads are passed through untouched",
    "",
    "Privacy: your API key stays in local storage and is only sent to openrouter.ai. Page context is sent to the OpenRouter API you configure; you can disable page-text excerpts or turn the whole add-on off for sensitive pages.",
    "",
    "Limitations: POST-generated and one-time URLs cannot be re-fetched (original name is kept). If 'always ask where to save' is on, re-downloads go to the default folder.",
    "",
    "Source code (MIT): " + REPO,
  ].join("\n"),
  "zh-TW": [
    "Smart Download Renamer 是 Firefox 擴充套件：下載檔案時自動依「下載當下頁面的資訊與 URL」呼叫 OpenRouter 指定的模型，預測一個具描述性的新檔名。命名失敗時自動退回原始檔名，不會弄丟任何下載。",
    "",
    "Firefox 沒有「下載時改檔名」的 API，因此本套件採用「暫停 → AI 命名 → 取消重抓」流程，並為每個環節設計退路：任何一步失敗都會還原原始下載，檔案不會遺失。",
    "",
    "功能：",
    "- 支援任何 OpenRouter 模型（預設 openai/gpt-oss-20b，每次命名成本約 $0.00003）",
    "- 檔名語言跟隨頁面內容（也可固定中文／英文）",
    "- 自訂命名 prompt",
    "- 設定頁內建診斷記錄：每個下載被處理的原因一目瞭然",
    "- POST 表單與 blob: 下載自動放行，不會干擾",
    "",
    "隱私：API Key 只存在本機，僅傳送給 openrouter.ai。命名時會將頁面標題、網址與（可選）頁面文字節錄送給 OpenRouter；處理敏感內容時可關閉節錄或暫時停用套件。",
    "",
    "已知限制：POST 表單／一次性網址的下載無法重抓（保留原名）；開啟「每次詢問儲存位置」時，重抓會直接存到預設資料夾。",
    "",
    "原始碼（MIT 授權）：" + REPO,
  ].join("\n"),
};

async function main() {
  console.log("更新 listing 中…");
  await amoFetch("/addons/addon/" + SLUG + "/", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: {
        "en-US": "Smart Download Renamer (OpenRouter)",
        "zh-TW": "智慧下載重新命名（OpenRouter）",
      },
      summary: SUMMARY,
      description: DESCRIPTION,
      homepage_url: REPO,
      support_url: { "en-US": REPO + "/issues", "zh-TW": REPO + "/issues" },
      categories: { firefox: ["download-management"] },
    }),
  });
  console.log("✓ listing 已更新（名稱／摘要／描述／連結／分類）");

  const detail = await amoFetch("/addons/addon/" + SLUG + "/?lang=zh-TW");
  console.log("--- 目前 listing ---");
  console.log("名稱:", JSON.stringify(detail.name));
  console.log("分類:", JSON.stringify(detail.categories));
  console.log("首頁:", detail.homepage_url);
}

main().catch((e) => {
  console.error("✗ " + e.message);
  process.exit(1);
});
