# Smart Download Renamer (OpenRouter)

Firefox 擴充套件：下載檔案時自動依「**下載當下頁面的資訊與 URL**」呼叫 [OpenRouter](https://openrouter.ai) 指定的模型，預測一個具描述性的新檔名。命名失敗時自動退回原始檔名，不會弄丟任何下載。

## 運作方式

Firefox 沒有提供「下載時改檔名」的擴充套件 API（`downloads.onDeterminingFilename` 至今未實作，見 [Bug 1245652](https://bugzilla.mozilla.org/show_bug.cgi?id=1245652)），因此本套件採用「**暫停 → 命名 → 取消重抓**」流程：

```
onCreated 偵測新下載
  → 立即 pause（下載面板短暫顯示暫停）
  → 向來源分頁收集頁面脈絡（標題、H1、描述、連結文字、頁面文字節錄）
  → 呼叫 OpenRouter chat completions 預測檔名主幹（10 秒逾時）
  → 清理成合法檔名、保留原始副檔名
  → cancel + erase 原下載 → downloads.download({url, filename: 新名}) 重抓
```

**退路設計**（任何一步失敗都不會影響下載）：
- 模型逾時／API 錯誤／回覆無效 → `resume` 原下載，保留原名
- `blob:`/`data:`/POST 表單等無法重抓的下載 → 直接放行，保留原名
- 重抓被伺服器拒絕（hotlink 防護、一次性 URL）→ 自動改用原檔名重抓一次
- 檔名與原名相同 → 不折騰，直接恢復

## 安裝（臨時載入，開發用）

1. 開啟 `about:debugging#/runtime/this-firefox`
2. 點「**載入暫時性附加元件**」→ 選本目錄的 `manifest.json`
3. 開啟套件設定頁，填入 OpenRouter API Key（[openrouter.ai/keys](https://openrouter.ai/keys)）與模型 ID
4. 點「測試 API 連線」確認可用

> 暫時載入的套件在重啟 Firefox 後會消失；長期使用請 `web-ext build` 打包成 xpi，再到 `about:addons` → 齒輪 → 「從檔案安裝附加元件」。

## 設定項

| 設定 | 說明 |
| --- | --- |
| 總開關 | 關閉後完全不介入任何下載 |
| API Key / 模型 | 存於本機 `storage.local`；可用任何 OpenRouter ID（預設 `openai/gpt-oss-20b`） |
| 檔名語言 | 跟隨頁面語言（預設）／一律中文／一律英文 |
| 命名 Prompt | 可自訂；`{LANG_RULE}` 會替換成語言規則 |
| 頁面文字節錄 | 預設開啟、上限 2000 字；關閉可減少傳送量，但命名準度下降 |
| 略過副檔名 | `.crdownload,.part,.download` 不處理 |
| API 逾時 | 預設 10 秒 |

## 疑難排解

下載沒有被改名時，先到 **設定頁 → 診斷** 看處理記錄（每筆下載的處理原因都會記錄）：

- 「**尚未設定 API Key／模型**」→ 設定有填但沒按「儲存設定」（「儲存並測試 API 連線」會自動存檔）
- 「**暫停時下載被中斷，改以重下載改名**」→ Firefox 對剛建立的下載立刻 `pause()` 有相容性問題（可能直接中斷它）。套件自動改用「以新名重下載」完成改名，過程失敗則以原名重下載還原。成功與否取決於伺服器是否允許短時間重複請求。
- 「**下載已完成（速度太快），改以重下載改名**」→ 小檔在暫停前就下載完了；套件等 AI 命名後以新名重下載，**成功後才刪除舊檔**（過程失敗原檔無損）
- 「**POST 等非 GET 下載，無法重抓**」→ 表單送出產生的下載無法重抓，套件透過 webRequest 辨識後直接放行（保留原名）
- 「**非 http(s) 下載**」→ `blob:`/`data:` 網址無法重抓，保留原名
- 完全沒有任何記錄 → 背景腳本沒接收到事件：確認套件有重新載入（about:debugging → Reload），並開啟除錯日誌看 console

改完程式碼後，記得到 `about:debugging` 點該套件的 **Reload** 才會生效。

## 模型候選名單

命名只需要「短輸出＋讀懂頁面文字」，不需要旗艦模型。以下價格為每百萬 token（2026-10 查價，價格隨時可能變動，以 [OpenRouter Models](https://openrouter.ai/models?order=pricing-low) 為準）。

### 免費（測試首選，有限流）

| 模型 ID | 說明 |
| --- | --- |
| `openrouter/free` | 免費模型路由器，自動配對當前可用的免費模型 |
| `nvidia/nemotron-3.5-lightning:free` | 快速、上下文 1M |
| `nvidia/nemotron-3-super-120b-a12b:free` | 大參數免費模型，中文表現佳 |
| `liquid/lfm-2.5-2.6b:free` | 極小模型，速度最快 |

> 免費模型有限流：未儲值約 50 次/天；OpenRouter 帳戶儲值 $10 後提升至 1000 次/天。每天下載量大請改用付費便宜模型。

### 付費超便宜（每次命名約 $0.00003，一千次不到 $0.05）

| 模型 ID | 輸入 / 輸出（每 M token） |
| --- | --- |
| `inclusionai/ling-3.0-flash` | $0.02 / $0.06 |
| `openai/gpt-oss-20b`（**預設**） | $0.02 / $0.09（推理模型，套件已自動調低推理強度） |
| `ibm-granite/granite-4.0-h-micro` | $0.02 / $0.11 |
| `mistralai/mistral-nemo` | $0.03 / $0.03 |
| `google/gemma-3-4b-it` | $0.04 / $0.05 |
| `meta-llama/llama-3.1-8b-instruct` | $0.05 / $0.08 |
| `mistralai/mistral-small-24b-instruct-2501` | $0.05 / $0.08 |

選擇建議：中文頁面多 → `openai/gpt-oss-20b` 或 Nemotron 系列；英文為主 → `mistral-nemo`、`gemma-3-4b-it`；只想零成本先試 → `openrouter/free`。

## 已知限制

- **POST 表單／一次性簽章 URL** 的下載無法重抓，會保留原始檔名。
- `blob:`、`data:` URL 下載（網頁內直接產生的檔案）不處理。
- 若 Firefox 開啟「每次下載都詢問儲存位置」，重抓會直接存到預設資料夾（略過詢問）。
- 頁面脈絡（標題、網址、節錄文字）會傳送給 OpenRouter 及其模型供應商。處理敏感內容時請暫時關閉總開關。

## 開發

```bash
# 單元測試（sanitize / context 純函式）
node tests/run-tests.js

# 語法檢查
node --check background.js && node --check content/content.js

# lint 與打包
npx web-ext lint
npx web-ext build

# 直接在乾淨的 Firefox profile 跑起來試
npx web-ext run
```

## 檔案結構

```
manifest.json          MV3 設定（downloads/storage/tabs 權限）
background.js          下載攔截主流程與所有退路
content/content.js     頁面脈絡收集（被動回應，不追蹤瀏覽）
lib/settings.js        預設值與 storage.local 讀寫
lib/sanitize.js        檔名清理、副檔名處理（純函式）
lib/context.js         prompt 組裝（純函式）
lib/openrouter.js      OpenRouter client（逾時、重試一次）
options/               設定頁
tests/run-tests.js     單元測試

## 授權

[MIT](LICENSE)
```
