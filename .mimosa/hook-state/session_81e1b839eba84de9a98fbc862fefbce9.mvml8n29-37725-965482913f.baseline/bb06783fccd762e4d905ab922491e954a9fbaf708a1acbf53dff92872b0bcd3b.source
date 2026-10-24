/*
 * Smart Download Renamer — 背景主流程。
 *
 * Firefox 沒有 downloads.rename() / onDeterminingFilename，因此依下載速度採三種路徑：
 *
 *  A. 慢檔（pause 成功、仍是 inprogress）：
 *     pause → AI 命名 → cancel+erase → 以新名重下載（單次傳輸）
 *  B. 被 pause 弄斷的下載（Firefox 相容性問題：對剛建立的下載立刻 pause 可能
 *     使其 interrupted）：AI 命名 → 以新名重下載；失敗則以原名重下載還原
 *  C. 快檔（暫停前已完成）：AI 命名 → 以新名重下載 → 成功後 removeFile 刪舊檔
 *     + erase 清記錄（先確認新檔成功才刪舊檔，任何失敗都不會丟檔案）
 *
 * POST 表單下載無法用 GET 重抓，透過 webRequest 記錄請求方法，直接放行。
 * 每個決策都寫入 storage.local 的 logEntries，設定頁「診斷」區可檢視。
 */
(function () {
  "use strict";

  const api = globalThis.browser || globalThis.chrome;

  const OWN_URL_TTL = 15000; // 「自己重發」標記的效期，避免無限循環
  const METHOD_TTL = 30000;  // webRequest 方法記錄的效期
  const LOG_MAX = 60;

  const state = {
    ownUrls: new Map(),  // url → expiresAt
    methods: new Map(),  // url → expiresAt（非 GET 請求）
    active: 0,           // 進行中的改名數（維持 event page 存活）
    keepAlive: null,
  };

  // 預載設定快取，onCreated 時可直接判斷
  SDR.settings.getSettings().catch(() => {});

  function log(...args) {
    console.log("[SDR]", ...args);
  }

  // 診斷記錄：最新在前，上限 60 筆；debug 開啟時同步輸出到 console
  async function diag(event, detail) {
    try {
      const s = await SDR.settings.getSettings();
      if (s.debug) log(event, detail || "");
      const { logEntries = [] } = await api.storage.local.get("logEntries");
      logEntries.unshift({
        t: new Date().toLocaleTimeString(),
        event,
        detail: detail == null ? "" : String(detail).slice(0, 200),
      });
      if (logEntries.length > LOG_MAX) logEntries.length = LOG_MAX;
      await api.storage.local.set({ logEntries });
    } catch (_) {
      /* 診斷失敗不影響主流程 */
    }
  }

  function basename(p) {
    if (typeof p !== "string" || !p) return "";
    return p.split(/[\\/]/).pop();
  }

  function isOwnRedownload(url) {
    const exp = state.ownUrls.get(url);
    if (!exp) return false;
    if (Date.now() > exp) {
      state.ownUrls.delete(url);
      return false;
    }
    return true;
  }

  function markOwn(url) {
    state.ownUrls.set(url, Date.now() + OWN_URL_TTL);
  }

  function fresh(map, url) {
    const exp = map.get(url);
    if (!exp) return false;
    if (Date.now() > exp) {
      map.delete(url);
      return false;
    }
    return true;
  }

  // 記錄非 GET 請求：這類下載無法重抓，必須放行
  if (api.webRequest && api.webRequest.onBeforeRequest) {
    api.webRequest.onBeforeRequest.addListener(
      (details) => {
        const m = (details.method || "").toUpperCase();
        if (m && m !== "GET" && m !== "HEAD") {
          state.methods.set(details.url, Date.now() + METHOD_TTL);
        }
        return {};
      },
      { urls: ["http://*/*", "https://*/*"], types: ["main_frame", "sub_frame", "object", "media"] },
      []
    );
  }

  // Firefox event page：改名期間保持活動，避免被卸載
  function bumpActivity(delta) {
    state.active = Math.max(0, state.active + delta);
    if (state.active > 0 && !state.keepAlive) {
      state.keepAlive = setInterval(() => {}, 25000);
    } else if (state.active === 0 && state.keepAlive) {
      clearInterval(state.keepAlive);
      state.keepAlive = null;
    }
  }

  function skipList(settings) {
    return String(settings.skipExtensions || "")
      .split(",")
      .map((s) => s.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean);
  }

  function shouldSkipByExt(filename, settings) {
    const { ext } = SDR.sanitize.splitFilename(filename || "");
    if (!ext) return false;
    return skipList(settings).includes(ext.toLowerCase());
  }

  api.downloads.onCreated.addListener((item) => {
    handleCreated(item).catch(async (e) => {
      console.error("[SDR] 未預期的錯誤:", e);
      await diag("未預期的錯誤", e && e.message);
      await safeResume(item.id);
    });
  });

  async function handleCreated(item) {
    const url = item.url || "";

    if (isOwnRedownload(url)) return;

    const settings = await SDR.settings.getSettings();
    if (!settings.enabled) return; // 總開關關閉：完全不介入
    if (!/^https?:/i.test(url)) {
      await diag("略過：非 http(s) 下載，無法重抓", url.slice(0, 80));
      return;
    }
    if (!settings.apiKey || !settings.model) {
      await diag("略過：尚未設定 API Key／模型（請在設定頁按「儲存設定」）", "");
      return;
    }
    if (fresh(state.methods, url)) {
      await diag("略過：POST 等非 GET 下載，無法重抓", url.slice(0, 80));
      return;
    }
    if (shouldSkipByExt(item.filename, settings)) {
      await diag("略過：副檔名在略過清單", item.filename);
      return;
    }

    // 立即暫停，爭取在完成前介入（失敗沒關係，完成/中斷各有對應路徑）
    try {
      await api.downloads.pause(item.id);
    } catch (_) {
      /* 已完成或已被中斷 */
    }

    bumpActivity(1);
    try {
      await renameDownload(item, settings);
    } catch (e) {
      await diag("流程錯誤，嘗試還原下載", e && e.message);
      await restoreOrResume(item, null);
    } finally {
      bumpActivity(-1);
    }
  }

  async function renameDownload(item, settings) {
    const [cur] = await api.downloads.search({ id: item.id });
    if (!cur) {
      await diag("查無下載記錄，放棄改名", "");
      return;
    }

    const itemInfo = {
      filename: basename(cur.filename || item.filename),
      url: item.url,
      referrer: item.referrer || cur.referrer || "",
      mime: item.mime || cur.mime || "",
      fileSize: item.fileSize || cur.fileSize || 0,
    };

    // ── 路徑 C：下載已完成（快檔）──
    // AI 命名 → 以新名重下載 → 成功後才刪除舊檔與舊記錄（先贏後刪，不丟檔）
    if (cur.state === "complete") {
      await renameCompleted(cur.id, itemInfo, settings);
      return;
    }

    // ── 路徑 B：被 pause 弄斷（Firefox 相容性）──
    const interrupted = cur.state === "interrupted";
    if (interrupted) {
      await diag(
        "暫停時下載被中斷（Firefox 相容性），改以重下載改名",
        cur.error || "未知原因"
      );
    } else if (cur.state !== "inprogress") {
      await diag("下載狀態異常，不處理", cur.state);
      return;
    } else {
      await diag("已暫停，開始命名流程", itemInfo.filename);
    }

    // ── 路徑 A/B 共用：AI 命名 ──
    const pageContext = await collectPageContext(item, settings).catch((e) => {
      diag("無法取得頁面脈絡，改用 URL 判斷", e && e.message);
      return null;
    });

    let rawName;
    try {
      rawName = await SDR.openRouter.suggestFilename({ pageContext, itemInfo, settings });
    } catch (e) {
      await diag("OpenRouter 呼叫失敗，還原原名下載", e.message);
      await restoreOrResume(item, itemInfo);
      return;
    }

    const newName = SDR.sanitize.buildFilename(rawName, itemInfo.filename, itemInfo.mime);
    if (!newName || newName === itemInfo.filename) {
      await diag("模型建議無效或與原名相同，還原原名下載", rawName.slice(0, 60));
      await restoreOrResume(item, itemInfo);
      return;
    }
    await diag("命名成功", itemInfo.filename + " → " + newName);

    // 取消並移除舊記錄，以新名重抓
    markOwn(item.url);
    if (!interrupted) await api.downloads.cancel(item.id).catch(() => {});
    await api.downloads.erase({ id: item.id }).catch(() => {});
    try {
      const newId = await api.downloads.download({
        url: item.url,
        filename: newName,
        conflictAction: "uniquify",
        saveAs: false,
      });
      watchDownload(newId, {
        onSuccess: () => diag("新檔名下載完成", newName),
        onInterrupted: () => {
          diag("重抓被中斷，改用原名重下載", item.url.slice(0, 80));
          redownloadOriginal(item.url, itemInfo);
        },
      });
    } catch (e) {
      await diag("重抓失敗，改用原名重下載", e.message);
      await redownloadOriginal(item.url, itemInfo);
    }
  }

  // 路徑 C：下載已完成。等命名後重下載，成功才刪舊檔。
  async function renameCompleted(oldId, itemInfo, settings) {
    await diag("下載已完成（速度太快），改以重下載改名", itemInfo.filename);

    const pageContext = await collectPageContext({ url: itemInfo.url, filename: itemInfo.filename }, settings).catch(
      () => null
    );

    let rawName;
    try {
      rawName = await SDR.openRouter.suggestFilename({ pageContext, itemInfo, settings });
    } catch (e) {
      await diag("OpenRouter 呼叫失敗，保留原檔", e.message);
      return;
    }

    const newName = SDR.sanitize.buildFilename(rawName, itemInfo.filename, itemInfo.mime);
    if (!newName || newName === itemInfo.filename) {
      await diag("模型建議無效或與原名相同，保留原檔", rawName.slice(0, 60));
      return;
    }
    await diag("命名成功，以新名重下載", itemInfo.filename + " → " + newName);

    markOwn(itemInfo.url);
    let newId;
    try {
      newId = await api.downloads.download({
        url: itemInfo.url,
        filename: newName,
        conflictAction: "uniquify",
        saveAs: false,
      });
    } catch (e) {
      await diag("重下載失敗，原檔保留（原名）", e.message);
      return;
    }

    watchDownload(newId, {
      onSuccess: async () => {
        // 新檔成功才清理舊檔與舊記錄
        await api.downloads.removeFile(oldId).catch(() => {});
        await api.downloads.erase({ id: oldId }).catch(() => {});
        diag("新檔名下載完成，舊檔已移除", newName);
      },
      onInterrupted: () => diag("重下載失敗，原檔保留（原名）", itemInfo.filename),
    });
  }

  // 監看單一下載直到 complete / interrupted
  function watchDownload(id, { onSuccess, onInterrupted }) {
    const listener = (delta) => {
      if (!delta || delta.id !== id) return;
      const st = delta.state && delta.state.current;
      if (st === "complete" || st === "interrupted") {
        api.downloads.onChanged.removeListener(listener);
        if (st === "complete") {
          if (onSuccess) Promise.resolve(onSuccess()).catch(() => {});
        } else if (onInterrupted) {
          onInterrupted();
        }
      }
    };
    api.downloads.onChanged.addListener(listener);
  }

  async function redownloadOriginal(url, itemInfo) {
    markOwn(url);
    try {
      const opts = { url, conflictAction: "uniquify", saveAs: false };
      if (itemInfo && itemInfo.filename) opts.filename = itemInfo.filename;
      await api.downloads.download(opts);
    } catch (e) {
      await diag("原名重下載也失敗（可能為一次性網址）", e.message);
    }
  }

  // 依下載目前狀態選擇還原方式：paused → resume；interrupted → 原名重下載
  async function restoreOrResume(item, itemInfo) {
    try {
      const [it] = await api.downloads.search({ id: item.id });
      if (it && it.paused && it.state === "inprogress") {
        await api.downloads.resume(item.id);
        return;
      }
    } catch (_) {
      /* 忽略 */
    }
    await redownloadOriginal(item.url, itemInfo);
  }

  async function safeResume(id) {
    try {
      const [it] = await api.downloads.search({ id });
      if (it && it.paused) await api.downloads.resume(id);
    } catch (_) {
      /* 忽略 */
    }
  }

  // 向目前作用中分頁的 content script 要頁面脈絡；1.5 秒逾時
  async function collectPageContext(item, settings) {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) throw new Error("找不到作用中分頁");
    const msg = {
      type: "SDR_GET_CONTEXT",
      downloadUrl: item.url,
      downloadBasename: basename(item.filename),
      includePageText: !!settings.includePageText,
      pageTextLimit: settings.pageTextLimit,
    };
    const res = await withTimeout(api.tabs.sendMessage(tab.id, msg), 1500);
    return res || null;
  }

  function withTimeout(p, ms) {
    return Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
  }
})();
