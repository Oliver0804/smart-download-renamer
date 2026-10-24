/*
 * OpenRouter API client：chat completion 呼叫與「建議檔名」封裝。
 * 失敗一律丟例外，由 background 決定退路（恢復原下載）。
 */
(function (global) {
  "use strict";

  const SDR = (global.SDR = global.SDR || {});

  const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

  async function chatCompletion({ apiKey, model, messages, timeoutMs = 10000, maxTokens = 512 }) {
    if (!apiKey) throw new Error("未設定 OpenRouter API Key");
    if (!model) throw new Error("未設定模型 ID");

    const body = {
      model: model,
      messages: messages,
      // 推理模型（如 gpt-oss）會先產出 reasoning 再給答案，額度太小會導致 content 為空
      max_tokens: maxTokens,
      temperature: 0.3,
    };
    // gpt-oss 系列支援推理強度：調低以減少 reasoning 佔用
    if (/^openai\/gpt-oss/i.test(model)) body.reasoning = { effort: "low" };

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
        body: JSON.stringify(body),
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
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    let content = msg ? msg.content : null;
    // 部分供應商回傳 content parts 陣列，串回純文字
    if (Array.isArray(content)) {
      content = content.map((p) => (p && p.text) || "").join("");
    }
    if (typeof content !== "string" || !content.trim()) {
      // 推理模型把額度耗在 reasoning 時 content 會是 null；退而求其次取推理尾行
      const r = msg && typeof msg.reasoning === "string" ? msg.reasoning : "";
      const lastLine = r.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop();
      if (lastLine) content = lastLine;
      else {
        throw new Error(
          "模型未回覆內容（可能推理耗盡輸出額度，或此模型不適合命名任務）"
        );
      }
    }
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
