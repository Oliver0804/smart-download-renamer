# Firefox 智慧下載重新命名擴充套件（Smart Download Renamer）

## 目標
在 `/Users/oliver/code/Firefox`（目前為空）從零建立一個 Firefox WebExtension：每次下載檔案時自動暫停，擷取「下載當下分頁的頁面資訊＋URL」，呼叫 OpenRouter 指定模型預測新檔名，再以新檔名完成下載。檔名語言跟隨頁面內容；失敗時無縫退回原檔名，使用者無感。

## 已確認的技術事實（決定架構）
- Firefox 不支援 `downloads.onDeterminingFilename`（[Bug 1245652](https://bugzilla.mozilla.org/show_bug.cgi?id=1245652)），也沒有 `downloads.rename()`。
- 採用替代流程：**暫停原下載 → AI 命名 → 取消原下載 → 用 `browser.downloads.download({url, filename})` 以新名重抓**。`downloads.download()` 走瀏覽器正常下載管線（含 cookie、重新導向），不需 host 權限、無記憶體上限。
- 無法處理的下載（blob:/data: URL、POST 表單產生的一次性下載）自動退回「恢復原下載、保留原名」，不硬改。

## 核心流程（background script）
1. `downloads.onCreated` 觸發 → 立即 `browser.downloads.pause(id)`（面板只會短暫顯示暫停）。
2. 向來源分頁的 content script 要求頁面脈絡（見下），同時準備原始檔名/URL/MIME。
3. 呼叫 OpenRouter `POST https://openrouter.ai/api/v1/chat/completions`（模型與 API key 由設定頁指定，存於 `browser.storage.local`），請模型只回覆「檔名主幹（不含副檔名）」。10 秒逾時。
4. 清理檔名：移除 `<>:"/\|?*` 與控制字元、去首尾空白與點、主幹上限 100 字元、**一律保留副檔名**（取原檔名，無副檔名時依 MIME 對照常見類型）。
5. `downloads.cancel(id)` → `downloads.erase({id})` → `downloads.download({url: 原URL, filename: 新名, conflictAction: "uniquify"})`。
6. 任何一步失敗（API 錯誤/逾時/模型回覆無效/blob 或 data: URL/使用者停用）→ `downloads.resume(id)` 恢復原下載，保留原名並記 log。若新下載本身失敗（如 hotlink 防護），退回用原 URL＋原檔名重下載。

## 專案結構
```
/Users/oliver/code/Firefox/
├── manifest.json          # MV3；permissions: downloads, storage；host_permissions: https://openrouter.ai/*
├── background.js          # 下載攔截主流程、暫停/取消/重抓、失敗退路
├── content/content.js     # 常駐 <all_urls>（document_idle），被動回應脈絡請求
├── lib/
│   ├── openrouter.js      # API client（fetch + 逾時 + 重試一次）
│   ├── sanitize.js        # 檔名清理與副檔名處理（純函式，可單測）
│   └── context.js         # 脈絡組裝與預設 prompt
├── options/
│   ├── options.html       # 設定頁
│   └── options.js
├── icons/                 # 16/32/48/128
└── README.md              # 安裝（about:debugging / xpi）、設定說明、隱私注意
```

## 頁面脈絡（送給模型的預設內容）
- 必送：分頁標題（`document.title`）、頁面 URL、原始檔名、來源 URL。
- 預送：符合該下載 URL 的連結錨點文字（content script 在頁面中比對 `a[href]`）。
- 可選（設定頁開關，預設開、截斷 2000 字）：頁面主要文字區塊摘錄（取 `<article>` 或最大文字密度區塊）。
- 預設 prompt（設定頁可完整自訂）：「根據下載時的頁面資訊，為檔案取簡潔、可搜尋的檔名（不含副檔名），語言跟隨頁面主要語言，只輸出檔名本身。」

## 設定頁選項
OpenRouter API key、模型 ID（預設 `openai/gpt-4o-mini`，可填任何 OpenRouter 模型）、自訂 prompt、是否送頁面正文、略過重新命名的副檔名清單（預設 `.crdownload,.part`）、總開關、測試按鈕（立即驗 API 連通）。

## 實作順序
1. Scaffold：manifest、目錄、空殼檔案與 icons。
2. `lib/sanitize.js` ＋ `lib/openrouter.js`（純邏輯，先寫單測）。
3. `background.js` 主流程含全部退路（先寫死 prompt 驗證流程可通）。
4. `content/content.js` 脈絡收集 ＋ `lib/context.js`。
5. options 頁完整 UI 與 storage 串接。
6. 打包驗證：`web-ext lint`、`web-ext build`；about:debugging 實測測試矩陣（普通檔案連結、PDF、blob 下載、大檔、無 key、API 逾時、檔名碰撞）。

## 已知限制（會寫進 README）
- POST 表單下載與一次性簽章 URL 無法重抓 → 保留原名。
- Firefox「總是詢問存檔位置」使用者：重抓時以 `saveAs:false` 存到預設資料夾，行為會略過詢問（列入已知行為）。
- 頁面脈絡會送至 OpenRouter（第三方），設定頁會明確標示隱私提示。
