/*
 * 設定頁：載入/儲存設定、OpenRouter 連線測試（會先存檔）、診斷記錄檢視。
 */
(function () {
  "use strict";

  const api = globalThis.browser || globalThis.chrome;
  const $ = (id) => document.getElementById(id);
  const els = {
    enabled: $("enabled"),
    apiKey: $("apiKey"),
    model: $("model"),
    languageMode: $("languageMode"),
    prompt: $("prompt"),
    includePageText: $("includePageText"),
    pageTextLimit: $("pageTextLimit"),
    skipExtensions: $("skipExtensions"),
    timeoutMs: $("timeoutMs"),
    debug: $("debug"),
    save: $("save"),
    test: $("test"),
    status: $("status"),
    testResult: $("testResult"),
    diagList: $("diagList"),
    refreshDiag: $("refreshDiag"),
  };

  function clamp(n, min, max, fallback) {
    n = Number(n);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function fill(s) {
    els.enabled.checked = !!s.enabled;
    els.apiKey.value = s.apiKey || "";
    els.model.value = s.model || "";
    els.languageMode.value = s.languageMode || "auto";
    els.prompt.value = s.prompt || "";
    els.prompt.placeholder = SDR.context.DEFAULT_PROMPT;
    els.includePageText.checked = !!s.includePageText;
    els.pageTextLimit.value = s.pageTextLimit;
    els.skipExtensions.value = s.skipExtensions;
    els.timeoutMs.value = s.timeoutMs;
    els.debug.checked = !!s.debug;
  }

  function read() {
    return {
      enabled: els.enabled.checked,
      apiKey: els.apiKey.value.trim(),
      model: els.model.value.trim(),
      languageMode: els.languageMode.value,
      prompt: els.prompt.value.trim(),
      includePageText: els.includePageText.checked,
      pageTextLimit: clamp(els.pageTextLimit.value, 200, 8000, 2000),
      skipExtensions: els.skipExtensions.value.trim(),
      timeoutMs: clamp(els.timeoutMs.value, 3000, 60000, 10000),
      debug: els.debug.checked,
    };
  }

  function flashStatus(text, cls) {
    els.status.textContent = text;
    els.status.className = cls || "";
    setTimeout(() => {
      els.status.textContent = "";
      els.status.className = "";
    }, 3000);
  }

  async function init() {
    fill(await SDR.settings.getSettings());
    await loadDiag();
    els.save.addEventListener("click", async () => {
      const s = await SDR.settings.setSettings(read());
      fill(s);
      flashStatus("✓ 已儲存", "ok");
    });
    els.test.addEventListener("click", testConnection);
    els.refreshDiag.addEventListener("click", loadDiag);
    // 診斷記錄更新時自動重新整理
    if (api.storage && api.storage.onChanged) {
      api.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.logEntries) loadDiag();
      });
    }
  }

  // 測試前先存檔，避免「測試通過但設定沒存」的陷阱
  async function testConnection() {
    const s = await SDR.settings.setSettings(read());
    fill(s);
    flashStatus("✓ 已儲存，測試中…", "");

    els.test.disabled = true;
    els.testResult.textContent = "";
    try {
      const reply = await SDR.openRouter.chatCompletion({
        apiKey: s.apiKey,
        model: s.model,
        messages: [{ role: "user", content: "請只回覆兩個字：成功" }],
        maxTokens: 10,
        timeoutMs: s.timeoutMs,
      });
      els.testResult.textContent = "✓ 連線成功，模型回覆：" + SDR.openRouter.extractName(reply);
    } catch (e) {
      els.testResult.textContent = "✗ " + e.message;
    } finally {
      els.test.disabled = false;
      els.test.textContent = "儲存並測試 API 連線";
    }
  }

  async function loadDiag() {
    const { logEntries = [] } = await api.storage.local.get("logEntries");
    els.diagList.textContent = "";
    if (!logEntries.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "（目前沒有記錄——下載一個檔案後再回來看）";
      els.diagList.appendChild(li);
      return;
    }
    for (const e of logEntries.slice(0, 25)) {
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.className = "t";
      t.textContent = "[" + e.t + "]";
      li.appendChild(t);
      li.appendChild(
        document.createTextNode(e.event + (e.detail ? " — " + e.detail : ""))
      );
      els.diagList.appendChild(li);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
