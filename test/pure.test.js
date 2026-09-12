"use strict";
const test = require("node:test");
const assert = require("node:assert");
const P = require("./_dom.js");

test("modelKey / parseModelKey round-trip with slashes", () => {
  const key = P.modelKey("siliconflow", "deepseek-ai/DeepSeek-V3");
  assert.strictEqual(typeof key, "string");
  assert.deepStrictEqual(P.parseModelKey(key), { providerID: "siliconflow", id: "deepseek-ai/DeepSeek-V3" });
  assert.strictEqual(P.parseModelKey("not-json"), null);
  assert.strictEqual(P.parseModelKey('["a"]'), null);
});

test("escapeHtml escapes the five characters", () => {
  assert.strictEqual(P.escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

test("uid has prefix and is unique", () => {
  const a = P.uid("ast");
  const b = P.uid("ast");
  assert.match(a, /^ast_[a-z0-9]+$/);
  assert.notStrictEqual(a, b);
});

test("avatarColor returns an hsl color", () => {
  assert.match(P.avatarColor("abc"), /^hsl\(\d{1,3},\d+%,\d+%\)$/);
});

test("textHash is deterministic and turnKey composes", () => {
  assert.strictEqual(P.textHash("hello"), P.textHash("hello"));
  assert.notStrictEqual(P.textHash("hello"), P.textHash("world"));
  assert.strictEqual(P.turnKey("s1", "hi"), "s1|" + P.textHash("hi"));
});

test("send stamp round-trips and never doubles", () => {
  const once = P.withSendStamp("hello");
  assert.match(once, /^hello\n\n\[发送时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]$/);
  const twice = P.withSendStamp(once);
  assert.strictEqual((twice.match(/发送时间/g) || []).length, 1);
  const sp = P.splitSendStamp(twice);
  assert.strictEqual(sp.body, "hello");
  assert.match(sp.stamp, /^\[发送时间/);
  assert.deepStrictEqual(P.splitSendStamp("plain"), { body: "plain", stamp: "" });
});

test("stampParts stamps the last text part without mutating input", () => {
  const input = [{ type: "file", url: "x" }, { type: "text", text: "hi" }];
  const out = P.stampParts(input);
  assert.strictEqual(input[1].text, "hi");
  assert.match(out[1].text, /^hi\n\n\[发送时间/);
  assert.notStrictEqual(out[1], input[1]);
});

test("messageTextParts joins text parts", () => {
  const m = { parts: [{ type: "text", text: "a" }, { type: "tool" }, { type: "text", text: "b" }] };
  assert.strictEqual(P.messageTextParts(m), "a\n\nb");
  assert.strictEqual(P.messageTextParts({}), "");
});

test("sanitizeFolderName strips illegal chars and defaults", () => {
  assert.strictEqual(P.sanitizeFolderName(""), "assistant");
  assert.strictEqual(P.sanitizeFolderName("  .x.  "), "x");
  const s = P.sanitizeFolderName('my/assistant: v1?*');
  assert.ok(!/[\\/:*?"<>|]/.test(s));
  assert.ok(s.startsWith("my"));
});

test("normDir normalizes case, slashes and trailing separators", () => {
  assert.strictEqual(P.normDir("C:\\A\\B\\\\"), "c:\\a\\b");
  assert.strictEqual(P.normDir("C:/A/B/"), "c:\\a\\b");
  assert.strictEqual(P.normDir(""), "");
});

test("uniqueWorkspace avoids used dirs (D2 no-reuse)", () => {
  const store = globalThis.localStorage;
  const prev = store.getItem("oc_ws_base");
  store.setItem("oc_ws_base", "C:\\ws");
  try {
    const first = P.uniqueWorkspace("a");
    assert.strictEqual(first, "C:\\ws\\a");
    P.markDirUsed(first);
    assert.strictEqual(P.uniqueWorkspace("a"), "C:\\ws\\a-2");
  } finally {
    if (prev === null) store.removeItem("oc_ws_base");
    else store.setItem("oc_ws_base", prev);
  }
});

test("classify maps mime to kind", () => {
  assert.strictEqual(P.classify("image/png"), "image");
  assert.strictEqual(P.classify("application/pdf"), "pdf");
  assert.strictEqual(P.classify("audio/mpeg"), "audio");
  assert.strictEqual(P.classify("video/mp4"), "video");
  assert.strictEqual(P.classify("text/plain"), "text");
  assert.strictEqual(P.classify(""), "text");
});

test("fmtSize buckets", () => {
  assert.strictEqual(P.fmtSize(500), "500 B");
  assert.strictEqual(P.fmtSize(2048), "2.0 KB");
  assert.strictEqual(P.fmtSize(3 * 1024 * 1024), "3.0 MB");
});

test("dataUrlSize estimates decoded bytes", () => {
  assert.strictEqual(P.dataUrlSize("data:image/png;base64,AAAA"), 3);
  assert.strictEqual(P.dataUrlSize(""), 0);
});

test("fmtNum / fmtCompact", () => {
  assert.strictEqual(P.fmtNum(1234), "1,234");
  assert.strictEqual(P.fmtCompact(999), "999");
  assert.strictEqual(P.fmtCompact(1500), "1.5k");
  assert.strictEqual(P.fmtCompact(15000), "15k");
  assert.strictEqual(P.fmtCompact(2500000), "2.5M");
});

test("tokenTotal prefers explicit total, else sums", () => {
  assert.strictEqual(P.tokenTotal({ total: 99, input: 1 }), 99);
  assert.strictEqual(P.tokenTotal({ input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } }), 15);
  assert.strictEqual(P.tokenTotal(null), 0);
});

test("pickLatestAssistant ignores in-progress zero-token message", () => {
  const done = { id: "a1", role: "assistant", time: { created: 1 }, tokens: { input: 10, output: 2 } };
  const streaming = { id: "a2", role: "assistant", time: { created: 2 }, tokens: {} };
  assert.strictEqual(P.pickLatestAssistant([done, streaming]), done);
  assert.strictEqual(P.pickLatestAssistant([streaming, done]), done);
  const user = { id: "u1", role: "user", time: { created: 3 }, tokens: {} };
  assert.strictEqual(P.pickLatestAssistant([done, user]), done);
  assert.strictEqual(P.pickLatestAssistant([]), null);
  assert.strictEqual(P.pickLatestAssistant([streaming]), streaming);
});

test("hexToRgba handles 3/6-digit hex and bad input", () => {
  assert.strictEqual(P.hexToRgba("#10a37f", 0.5), "rgba(16, 163, 127, 0.5)");
  assert.strictEqual(P.hexToRgba("#fff", 1), "rgba(255, 255, 255, 1)");
  assert.match(P.hexToRgba("nope", 0.3), /^rgba\(0,0,0,0\.3\)$/);
});

test("accentPreset falls back to the first preset", () => {
  assert.strictEqual(P.accentPreset("blue").id, "blue");
  assert.strictEqual(P.accentPreset("does-not-exist").id, "green");
  assert.strictEqual(P.accentPreset(null).accent, "#10a37f");
});

test("fmtCost applies fx rate and formats", () => {
  const store = globalThis.localStorage;
  store.removeItem("oc_fx_rate");
  assert.strictEqual(P.fmtCost(0), "0");
  assert.strictEqual(P.fmtCost(0.5), "0.500");
  assert.strictEqual(P.fmtCost(0.001), "0.0010");
});

test("fmtDurationMs", () => {
  assert.strictEqual(P.fmtDurationMs(1500), "1.5s");
  assert.strictEqual(P.fmtDurationMs(65000), "1m05s");
  assert.strictEqual(P.fmtDurationMs(-5), "0.0s");
});

test("parentPath handles windows paths", () => {
  assert.strictEqual(P.parentPath("C:\\Users\\x"), "C:\\Users");
  assert.strictEqual(P.parentPath("C:\\Users"), "C:\\");
  assert.strictEqual(P.parentPath("C:\\Users\\x\\"), "C:\\Users");
});

test("escapeRe escapes regex metacharacters", () => {
  assert.strictEqual(P.escapeRe("a.b*c"), "a\\.b\\*c");
});

test("searchSnippet escapes HTML and marks hits", () => {
  const html = P.searchSnippet("see <script>alert(1)</script> world", ["world"]);
  assert.ok(html.includes("<mark>world</mark>"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("protectSegments / restoreCode round-trip a fenced block", () => {
  const store = [];
  const src = "a ```js\nconst x = 1;\n``` b";
  const prot = P.protectSegments(src, /```[\s\S]*?```/g, store, (i) => "\uE000" + i + "\uE001");
  assert.ok(prot.includes("\uE000"));
  const html = "<p>" + prot + "</p>";
  const out = P.restoreCode(html, store);
  assert.ok(out.includes('<pre><code class="language-js">'));
  assert.ok(out.includes("const x = 1;"));
});

test("pushError bounds the recent-errors log and dedupes", () => {
  P.recentErrors.length = 0;
  P.pushError("t", "same");
  assert.strictEqual(P.recentErrors.length, 1);
  P.pushError("t", "same");
  assert.strictEqual(P.recentErrors.length, 1);
  for (let i = 0; i < 80; i++) P.pushError("s" + i, "m" + i);
  assert.ok(P.recentErrors.length <= 50);
  assert.strictEqual(P.recentErrors[P.recentErrors.length - 1].message, "m79");
  P.recentErrors.length = 0;
});

test("proxyTranscript labels roles and trims", () => {
  const t = P.proxyTranscript([
    { info: { role: "user" }, parts: [{ type: "text", text: "hello" }] },
    { info: { role: "assistant" }, parts: [{ type: "text", text: "world" }] },
  ]);
  assert.match(t, /【用户】 hello/);
  assert.match(t, /【对方】 world/);
});

test("isAuthErrorText detects 401/403 and key errors only", () => {
  assert.strictEqual(P.isAuthErrorText("AI_APICallError [401] invalid api key"), true);
  assert.strictEqual(P.isAuthErrorText("403 Forbidden"), true);
  assert.strictEqual(P.isAuthErrorText("Unauthorized"), true);
  assert.strictEqual(P.isAuthErrorText("API key not authenticated"), true);
  assert.strictEqual(P.isAuthErrorText("model not found"), false);
  assert.strictEqual(P.isAuthErrorText("429 rate limit exceeded"), false);
  assert.strictEqual(P.isAuthErrorText(""), false);
});

test("isDarkMode resolves light / dark / auto", () => {
  assert.strictEqual(P.isDarkMode("dark"), true);
  assert.strictEqual(P.isDarkMode("light"), false);
  assert.strictEqual(P.isDarkMode("auto"), false);
  const orig = globalThis.window.matchMedia;
  try {
    globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    assert.strictEqual(P.isDarkMode("auto"), true);
    globalThis.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    assert.strictEqual(P.isDarkMode("auto"), false);
  } finally {
    globalThis.window.matchMedia = orig;
  }
});

test("canNotify requires enabled + granted + window hidden", () => {
  assert.strictEqual(P.canNotify(true, true, "granted"), true);
  assert.strictEqual(P.canNotify(false, true, "granted"), false);
  assert.strictEqual(P.canNotify(true, false, "granted"), false);
  assert.strictEqual(P.canNotify(true, true, "denied"), false);
  assert.strictEqual(P.canNotify(true, true, "default"), false);
});

test("applyProfileObject imports only oc_ string keys", () => {
  const n = P.applyProfileObject({ data: { oc_theme: "dark", other: "x", oc_num: 5 } });
  assert.strictEqual(n, 1);
  assert.strictEqual(globalThis.localStorage.getItem("oc_theme"), "dark");
  assert.strictEqual(globalThis.localStorage.getItem("other"), null);
  assert.throws(() => P.applyProfileObject(null));
});

test("filterModelGroups matches provider name or model name", () => {
  const provs = [
    { id: "openai", name: "OpenAI", models: [{ id: "gpt-4", name: "GPT-4" }, { id: "o1", name: "o1" }] },
    { id: "anthropic", name: "Anthropic", models: [{ id: "claude", name: "Claude" }] },
  ];
  assert.strictEqual(P.filterModelGroups(provs, "").length, 2);
  const byModel = P.filterModelGroups(provs, "claude");
  assert.strictEqual(byModel.length, 1);
  assert.strictEqual(byModel[0].prov.id, "anthropic");
  assert.strictEqual(byModel[0].items.length, 1);
  const byProvider = P.filterModelGroups(provs, "open");
  assert.strictEqual(byProvider.length, 1);
  assert.strictEqual(byProvider[0].items.length, 2);
  assert.strictEqual(P.filterModelGroups(provs, "gpt")[0].items.length, 1);
  assert.strictEqual(P.filterModelGroups(provs, "nope").length, 0);
});

test("sessionDayLabel resolves today / yesterday / date", () => {
  const now = new Date(2026, 8, 12, 10, 0).getTime();
  assert.strictEqual(P.sessionDayLabel(new Date(2026, 8, 12, 1, 0).getTime(), now), "今天");
  assert.strictEqual(P.sessionDayLabel(new Date(2026, 8, 11, 23, 0).getTime(), now), "昨天");
  assert.strictEqual(P.sessionDayLabel(new Date(2026, 8, 9, 12, 0).getTime(), now), "2026-09-09");
});

test("fmtSessionTime switches precision by age", () => {
  const now = new Date(2026, 8, 12, 12, 0).getTime();
  assert.strictEqual(P.fmtSessionTime(new Date(2026, 8, 12, 9, 5).getTime(), now), "09:05");
  assert.strictEqual(P.fmtSessionTime(new Date(2026, 8, 11, 22, 30).getTime(), now), "昨天");
  assert.strictEqual(P.fmtSessionTime(new Date(2026, 8, 9, 8, 0).getTime(), now), "09-09");
  assert.strictEqual(P.fmtSessionTime(new Date(2025, 11, 31, 8, 0).getTime(), now), "2025-12-31");
  assert.strictEqual(P.fmtSessionTime(0, now), "");
});

test("sessionUpdated prefers updated then created", () => {
  assert.strictEqual(P.sessionUpdated({ time: { created: 5, updated: 9 } }), 9);
  assert.strictEqual(P.sessionUpdated({ time: { created: 5 } }), 5);
  assert.strictEqual(P.sessionUpdated({}), 0);
  assert.strictEqual(P.sessionUpdated(null), 0);
});

test("groupSessionsByDay groups and labels in order", () => {
  const now = new Date(2026, 8, 12, 12, 0).getTime();
  const list = [
    { id: "a", time: { updated: new Date(2026, 8, 12, 9, 0).getTime() } },
    { id: "b", time: { updated: new Date(2026, 8, 11, 9, 0).getTime() } },
    { id: "c", time: { updated: new Date(2026, 8, 11, 8, 0).getTime() } },
    { id: "d", time: { updated: new Date(2026, 8, 1, 8, 0).getTime() } },
  ];
  const groups = P.groupSessionsByDay(list, now);
  assert.strictEqual(groups.length, 3);
  assert.strictEqual(groups[0].label, "今天");
  assert.strictEqual(groups[1].label, "昨天");
  assert.strictEqual(groups[2].label, "2026-09-01");
  assert.deepStrictEqual(groups[1].items.map(s => s.id), ["b", "c"]);
});

test("filterSessions matches title, directory, owner and id", () => {
  const list = [
    { id: "s1", title: "修复登录", directory: "C:\\work\\alpha" },
    { id: "s2", title: "写文档", directory: "C:\\work\\beta" },
  ];
  const nameOf = (s) => (s.id === "s1" ? "小明" : "小红");
  assert.strictEqual(P.filterSessions(list, "").length, 2);
  assert.strictEqual(P.filterSessions(list, "登录")[0].id, "s1");
  assert.strictEqual(P.filterSessions(list, "beta")[0].id, "s2");
  assert.strictEqual(P.filterSessions(list, "小明", nameOf)[0].id, "s1");
  assert.strictEqual(P.filterSessions(list, "小红", nameOf)[0].id, "s2");
  assert.strictEqual(P.filterSessions(list, "修复 小明", nameOf).length, 1);
  assert.strictEqual(P.filterSessions(list, "修复 小红", nameOf).length, 0);
  assert.strictEqual(P.filterSessions(list, "s2").length, 1);
  assert.strictEqual(P.filterSessions(list, "nope").length, 0);
});

test("i18n t() translates to English and falls back to source", () => {
  const store = globalThis.localStorage;
  store.removeItem("oc_lang");
  P.setLang("zh");
  assert.strictEqual(P.currentLang(), "zh");
  assert.strictEqual(P.t("设置"), "设置");
  P.setLang("en");
  assert.strictEqual(P.currentLang(), "en");
  assert.strictEqual(P.t("设置"), "Settings");
  assert.strictEqual(P.t("未知文本 xyz"), "未知文本 xyz");
  P.setLang("zh");
  assert.strictEqual(P.t("设置"), "设置");
  store.removeItem("oc_lang");
});

test("toolInfo maps known tools and falls back to id", () => {
  assert.strictEqual(P.toolInfo("bash").name, "运行命令");
  assert.ok(P.toolInfo("grep").desc.length > 0);
  assert.strictEqual(P.toolInfo("nonexistent").name, "nonexistent");
  assert.strictEqual(P.toolInfo("nonexistent").desc, "");
  assert.strictEqual(P.toolInfo(null).name, "工具");
});

test("renderQuality resolves stored level with low-perf migration", () => {
  const store = globalThis.localStorage;
  store.removeItem("oc_render_quality");
  store.removeItem("oc_low_perf");
  assert.strictEqual(P.renderQuality(), "standard");
  store.setItem("oc_low_perf", "1");
  assert.strictEqual(P.renderQuality(), "low");
  store.setItem("oc_render_quality", "high");
  assert.strictEqual(P.renderQuality(), "high");
  store.setItem("oc_render_quality", "bogus");
  assert.strictEqual(P.renderQuality(), "low");
  store.removeItem("oc_render_quality");
  store.removeItem("oc_low_perf");
});

test("lowPerfEnabled reflects oc_low_perf flag", () => {
  const store = globalThis.localStorage;
  store.removeItem("oc_low_perf");
  assert.strictEqual(P.lowPerfEnabled(), false);
  store.setItem("oc_low_perf", "1");
  assert.strictEqual(P.lowPerfEnabled(), true);
  store.setItem("oc_low_perf", "0");
  assert.strictEqual(P.lowPerfEnabled(), false);
  store.removeItem("oc_low_perf");
});

test("settingsQueryMatches does case-insensitive AND across terms", () => {
  assert.strictEqual(P.settingsQueryMatches("翻译模型", ""), true);
  assert.strictEqual(P.settingsQueryMatches("翻译模型", "   "), true);
  assert.strictEqual(P.settingsQueryMatches("OCR 模型", "ocr"), true);
  assert.strictEqual(P.settingsQueryMatches("翻译思考强度", "翻译 强度"), true);
  assert.strictEqual(P.settingsQueryMatches("翻译思考强度", "翻译 模型"), false);
  assert.strictEqual(P.settingsQueryMatches("", "x"), false);
  assert.strictEqual(P.settingsQueryMatches(null, "x"), false);
});

test("isOcrModelName detects dedicated OCR models", () => {
  assert.strictEqual(P.isOcrModelName({ id: "deepseek-ai/DeepSeek-OCR" }), true);
  assert.strictEqual(P.isOcrModelName({ id: "x", name: "PaddleOCR-VL-1.5" }), true);
  assert.strictEqual(P.isOcrModelName({ id: "Qwen/Qwen3-VL-8B-Instruct", name: "Qwen3 VL 8B" }), false);
  assert.strictEqual(P.isOcrModelName(null), false);
});

test("isVisionModel checks input.image or attachment", () => {
  assert.strictEqual(P.isVisionModel({ capabilities: { input: { image: true } } }), true);
  assert.strictEqual(P.isVisionModel({ capabilities: { attachment: true, input: { image: false } } }), true);
  assert.strictEqual(P.isVisionModel({ capabilities: { attachment: false, input: { image: false } } }), false);
  assert.strictEqual(P.isVisionModel({ capabilities: {} }), false);
  assert.strictEqual(P.isVisionModel(null), false);
});

test("ocrDisplayKeyFromParts hashes only OCR-prefixed text parts", () => {
  assert.strictEqual(P.OCR_TEXT_PREFIX, "【图片 OCR：");
  const parts = [
    { type: "file", url: "data:x" },
    { type: "text", text: P.OCR_TEXT_PREFIX + "a.png】\nhello" },
    { type: "text", text: "普通文本" },
  ];
  const ocrOnly = [parts[1].text].join("\n\n");
  assert.strictEqual(P.ocrDisplayKeyFromParts(parts), P.textHash(ocrOnly));
  assert.strictEqual(P.ocrDisplayKeyFromParts([{ type: "text", text: "hi" }]), "");
  assert.strictEqual(P.ocrDisplayKeyFromParts([]), "");
});


