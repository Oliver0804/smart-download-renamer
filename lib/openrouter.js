/*
 * OpenRouter API client：chat completion 呼叫與「建議檔名」封裝。
 * 失敗一律丟例外，由 background 決定退路（恢復原下載）。
 */
(function (global) {
  "use strict";

  const SDR = (global.SDR = global.SDR || {});

  const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

  async function chatCompletion({ apiKey, model, messages, timeoutMs = 10000, maxTokens = 80 }) {
    if (!apiKey) throw new Error("未設定 OpenRouter API Key");
    if (!model) throw new Error("未設定模型 ID");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      const reason = e && e.name === "AbortError" ? "逾時(" + timeoutMs + "ms)" : e.message;
      throw new Error("OpenRouter 連線失敗: " + reason);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = (j.error && j.error.message) || JSON.stringify(j).slice(0, 200);
      } catch (_) {
        /* 忽略解析失敗 */
      }
      throw new Error("OpenRouter API " + res.status + ": " + detail);
    }

    const data = await res.json();
    const content =
      data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : null;
    if (typeof content !== "string") throw new Error("OpenRouter 回覆格式異常");
    return content;
  }

  // 從模型回覆抽出乾淨的檔名主幹（第一行、去引號與 code fence）
  function extractName(reply) {
    if (typeof reply !== "string") return "";
    return reply
      .replace(/```[a-z]*\n?/gi, "")
      .replace(/["'`「」『』]/g, "")
      .split(/\r?\n/)[0]
      .trim();
  }

  // 主入口：回傳建議的檔名主幹；網路類錯誤自動重試一次（4xx 不重試）
  async function suggestFilename({ pageContext, itemInfo, settings }) {
    const messages = [
      { role: "system", content: SDR.context.buildSystemPrompt(settings) },
      { role: "user", content: SDR.context.buildUserContent(pageContext, itemInfo, settings) },
    ];
    const call = () =>
      chatCompletion({
        apiKey: settings.apiKey,
        model: settings.model,
        messages: messages,
        timeoutMs: settings.timeoutMs,
      });

    let reply;
    try {
      reply = await call();
    } catch (e) {
      const isClientError = /^OpenRouter API 4/.test(e.message);
      if (isClientError) throw e;
      reply = await call(); // 重試一次
    }

    const name = extractName(reply);
    if (!name || name.length > 120) throw new Error("模型未回覆有效檔名");
    return name;
  }

  SDR.openRouter = { chatCompletion, extractName, suggestFilename };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SDR.openRouter;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
