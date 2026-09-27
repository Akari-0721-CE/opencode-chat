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

test("workspaceTarget picks unique folders under a base", () => {
  const used = new Set();
  assert.strictEqual(P.workspaceTarget("D:\\ws", "my/asst", used), "D:\\ws\\my-asst");
  used.add(P.normDir("D:\\ws\\my-asst"));
  assert.strictEqual(P.workspaceTarget("D:\\ws", "my/asst", used), "D:\\ws\\my-asst-2");
  assert.strictEqual(P.workspaceTarget("", "x", used), "");
});

test("dirUnderBase only matches strict children", () => {
  assert.strictEqual(P.dirUnderBase("C:\\ws\\a", "C:\\ws"), true);
  assert.strictEqual(P.dirUnderBase("C:\\ws\\a\\b", "C:\\ws"), true);
  assert.strictEqual(P.dirUnderBase("C:/ws/a/", "C:\\ws"), true);
  assert.strictEqual(P.dirUnderBase("C:\\ws", "C:\\ws"), false);
  assert.strictEqual(P.dirUnderBase("C:\\wsz\\a", "C:\\ws"), false);
  assert.strictEqual(P.dirUnderBase("", "C:\\ws"), false);
  assert.strictEqual(P.dirUnderBase("C:\\ws\\a", ""), false);
});

test("classify maps mime to kind", () => {  assert.strictEqual(P.classify("image/png"), "image");
  assert.strictEqual(P.classify("application/pdf"), "pdf");
  assert.strictEqual(P.classify("audio/mpeg"), "audio");
  assert.strictEqual(P.classify("video/mp4"), "video");
  assert.strictEqual(P.classify("text/plain"), "text");
  assert.strictEqual(P.classify(""), "text");
});

test("isTextLike detects text-ish files by mime or extension", () => {
  assert.strictEqual(P.isTextLike("text/plain", "a.txt"), true);
  assert.strictEqual(P.isTextLike("application/json", "a.json"), true);
  assert.strictEqual(P.isTextLike("application/json; charset=utf-8", "a.json"), true);
  assert.strictEqual(P.isTextLike("", "config.json"), true);
  assert.strictEqual(P.isTextLike("", "notes.md"), true);
  assert.strictEqual(P.isTextLike("application/octet-stream", "data.bin"), false);
  assert.strictEqual(P.isTextLike("", "archive.zip"), false);
  assert.strictEqual(P.isTextLike("image/svg+xml", "logo.svg"), false);
});

test("sendMimeFor normalizes text files to text/plain only", () => {
  assert.strictEqual(P.sendMimeFor("application/json", "a.json"), "text/plain");
  assert.strictEqual(P.sendMimeFor("", "a.csv"), "text/plain");
  assert.strictEqual(P.sendMimeFor("image/png", "a.png"), "image/png");
  assert.strictEqual(P.sendMimeFor("application/pdf", "a.pdf"), "application/pdf");
  assert.strictEqual(P.sendMimeFor("", "a.zip"), "application/octet-stream");
});

test("sendSignature ignores data payload, keys on name/size/length", () => {
  const a = [{ name: "x.json", size: 10, dataUrl: "data:a" }];
  const b = [{ name: "x.json", size: 10, dataUrl: "data:b" }];
  assert.strictEqual(P.sendSignature("hi", a), P.sendSignature("hi", b));
  assert.notStrictEqual(P.sendSignature("hi", a), P.sendSignature("ho", a));
});

test("partVisible / messageVisible filter compaction and synthetic", () => {
  assert.strictEqual(P.partVisible({ type: "compaction" }), false);
  assert.strictEqual(P.partVisible({ type: "text", synthetic: true, text: "x" }), false);
  assert.strictEqual(P.partVisible({ type: "text", text: "  " }), false);
  assert.strictEqual(P.partVisible({ type: "text", text: "hi" }), true);
  assert.strictEqual(P.partVisible({ type: "file", url: "data:x" }), true);
  // compaction user message -> hidden
  assert.strictEqual(P.messageVisible({ id: "m1", role: "user" }, [{ type: "compaction" }]), false);
  // user message with an image file -> shown
  assert.strictEqual(P.messageVisible({ id: "m2", role: "user" }, [{ type: "file" }]), true);
  // unfinished assistant with no content yet -> shown (still streaming)
  assert.strictEqual(P.messageVisible({ id: "m3", role: "assistant" }, [{ type: "step-start" }]), true);
  // finished empty assistant -> hidden
  assert.strictEqual(P.messageVisible({ id: "m4", role: "assistant", time: { completed: 1 } }, [{ type: "step-start" }]), false);
  // errored assistant -> shown
  assert.strictEqual(P.messageVisible({ id: "m5", role: "assistant", error: { name: "x" } }, []), true);
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

test("partTiming classifies reasoning / tool / text parts", () => {
  assert.deepStrictEqual(P.partTiming({ type: "reasoning", time: { start: 10, end: 30 } }), { kind: "think", start: 10, end: 30 });
  assert.deepStrictEqual(P.partTiming({ type: "text", time: { start: 5, end: 9 } }), { kind: "gen", start: 5, end: 9 });
  assert.deepStrictEqual(P.partTiming({ type: "tool", state: { time: { start: 1, end: 4 } } }), { kind: "tool", start: 1, end: 4 });
  assert.strictEqual(P.partTiming({ type: "tool", state: {} }), null);
  assert.strictEqual(P.partTiming({ type: "step-start" }), null);
  assert.strictEqual(P.partTiming(null), null);
});

test("sumPartTimings totals thinking / tool / generation and marks live", () => {
  const map = {
    a: { kind: "think", start: 0, end: 2000 },
    b: { kind: "tool", start: 2000, end: 3500 },
    c: { kind: "gen", start: 3500, end: 5000 },
  };
  const done = P.sumPartTimings(map, 9999);
  assert.deepStrictEqual(done.t, { think: 2000, tool: 1500, gen: 1500, total: 5000 });
  assert.strictEqual(done.live, false);
  const live = P.sumPartTimings({ a: { kind: "think", start: 1000, end: 0 } }, 4000);
  assert.strictEqual(live.t.think, 3000);
  assert.strictEqual(live.t.total, 3000);
  assert.strictEqual(live.live, true);
  assert.deepStrictEqual(P.sumPartTimings(null, 1).t, { think: 0, tool: 0, gen: 0, total: 0 });
});

test("entryTotalMs uses turnEnd wall-clock, else falls back", () => {
  assert.strictEqual(P.entryTotalMs({ genStart: 1000, turnEnd: 4000 }, false, 999), 3000);
  assert.strictEqual(P.entryTotalMs({ genStart: 1000 }, false, 500), 500);
  assert.strictEqual(P.entryTotalMs(null, false, 7), 7);
  assert.strictEqual(P.entryTotalMs({ genStart: 5000, turnEnd: 1000 }, false, 0), 0);
});

test("parentPath handles windows paths", () => {
  assert.strictEqual(P.parentPath("C:\\Users\\x"), "C:\\Users");
  assert.strictEqual(P.parentPath("C:\\Users"), "C:\\");
  assert.strictEqual(P.parentPath("C:\\Users\\x\\"), "C:\\Users");
  assert.strictEqual(P.parentPath("D:\\"), "D:\\");
  assert.strictEqual(P.parentPath("D:"), "D:\\");
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

const MD_L = {
  session: "会话", assistant: "助手", workspace: "工作区", exportedAt: "导出时间", messageCount: "消息数",
  you: "你", thinking: "思考", tool: "工具", image: "图片", file: "文件", truncated: "（截断）",
};

test("mdFileName sanitizes illegal chars and bounds length", () => {
  assert.strictEqual(P.mdFileName('a/b:c*?'), "a-b-c");
  assert.strictEqual(P.mdFileName("   "), "session");
  assert.strictEqual(P.mdFileName(null), "session");
  assert.strictEqual(P.mdFileName("a".repeat(100)).length, 60);
});

test("mdFence grows past embedded backtick runs", () => {
  assert.strictEqual(P.mdFence("hi"), "```\nhi\n```");
  assert.ok(P.mdFence("x\n````\ny").startsWith("`````\n"));
});

test("messageToMarkdown renders roles, strips stamp, tools and files", () => {
  const user = { info: { role: "user" }, parts: [{ type: "text", text: "你好\n\n[发送时间：2026-01-01 00:00:00]" }] };
  assert.strictEqual(P.messageToMarkdown(user, MD_L), "## 你\n\n你好");
  const asst = {
    info: { role: "assistant" },
    parts: [
      { type: "text", text: "完成" },
      { type: "reasoning", text: "先看看" },
      { type: "tool", tool: "bash", state: { status: "completed", input: { command: "npm test" }, output: "ok\n" } },
      { type: "file", mime: "image/png", filename: "a.png" },
    ],
  };
  const md = P.messageToMarkdown(asst, MD_L);
  assert.ok(md.startsWith("## 助手"));
  assert.ok(md.includes("**思考**\n\n> 先看看"));
  assert.ok(md.includes("**工具："));
  assert.ok(md.includes("`npm test`"));
  assert.ok(md.includes("ok"));
  assert.ok(md.includes("[图片：a.png]"));
  assert.strictEqual(P.messageToMarkdown({ info: { role: "assistant" }, parts: [{ type: "step-start" }] }, MD_L), "");
});

test("normalizeThemePref accepts light/dark else auto", () => {
  assert.strictEqual(P.normalizeThemePref("dark"), "dark");
  assert.strictEqual(P.normalizeThemePref("light"), "light");
  assert.strictEqual(P.normalizeThemePref("auto"), "auto");
  assert.strictEqual(P.normalizeThemePref("bogus"), "auto");
  assert.strictEqual(P.normalizeThemePref(null), "auto");
});

test("clampFontSize bounds to 12..22 with 15 default", () => {
  assert.strictEqual(P.clampFontSize(14), 14);
  assert.strictEqual(P.clampFontSize(5), 12);
  assert.strictEqual(P.clampFontSize(99), 22);
  assert.strictEqual(P.clampFontSize("16"), 16);
  assert.strictEqual(P.clampFontSize("x"), 15);
  assert.strictEqual(P.clampFontSize(null), 15);
});

test("edgeSwipeIntent opens from the left edge and closes on left drag", () => {
  assert.strictEqual(P.edgeSwipeIntent({ startX: 5, endX: 60, startY: 100, endY: 102, open: false, edge: 28, trigger: 40 }), "open");
  assert.strictEqual(P.edgeSwipeIntent({ startX: 80, endX: 140, startY: 100, endY: 100, open: false, edge: 28, trigger: 40 }), "none");
  assert.strictEqual(P.edgeSwipeIntent({ startX: 5, endX: 30, startY: 100, endY: 100, open: false, edge: 28, trigger: 40 }), "none");
  assert.strictEqual(P.edgeSwipeIntent({ startX: 200, endX: 120, startY: 100, endY: 104, open: true, edge: 28, trigger: 40 }), "close");
  assert.strictEqual(P.edgeSwipeIntent({ startX: 200, endX: 160, startY: 100, endY: 104, open: true, edge: 28, trigger: 40 }), "none");
  assert.strictEqual(P.edgeSwipeIntent({ startX: 5, endX: 60, startY: 100, endY: 220, open: false, edge: 28, trigger: 40 }), "none");
});

test("guessFileName derives a name from a url or fallback", () => {
  assert.strictEqual(P.guessFileName("http://x/y/photo.png"), "photo.png");
  const data = P.guessFileName("data:image/png;base64,AAAA", "shot");
  assert.match(data, /^shot-\d+\.png$/);
  const webb = P.guessFileName("data:image/webp;base64,AAAA", "");
  assert.match(webb, /^opencode-\d+\.webp$/);
});

test("isAndroidApp is false without the native bridge", () => {
  assert.strictEqual(P.isAndroidApp(), false);
});

test("favLabel takes the last path segment", () => {
  assert.strictEqual(P.favLabel("D:\\work\\my project"), "my project");
  assert.strictEqual(P.favLabel("D:\\work\\my project\\"), "my project");
  assert.strictEqual(P.favLabel("/home/user/docs"), "docs");
  assert.strictEqual(P.favLabel("D:\\"), "D:");
});

test("fileExt / isImageName / fileMime map extensions", () => {
  assert.strictEqual(P.fileExt("Photo.PNG"), "png");
  assert.strictEqual(P.fileExt("noext"), "");
  assert.strictEqual(P.fileExt("a.b.c.txt"), "txt");
  assert.strictEqual(P.isImageName("a.webp"), true);
  assert.strictEqual(P.isImageName("a.jpeg"), true);
  assert.strictEqual(P.isImageName("a.txt"), false);
  assert.strictEqual(P.fileMime("a.md"), "text/markdown");
  assert.strictEqual(P.fileMime("a.unknown"), "application/octet-stream");
});

test("sessionToMarkdown builds a header, metadata and separators", () => {
  const md = P.sessionToMarkdown({ id: "s1", title: "测试会话", directory: "C:\\ws\\a" }, [
    { info: { role: "user" }, parts: [{ type: "text", text: "hi" }] },
    { info: { role: "assistant" }, parts: [{ type: "text", text: "yo" }] },
  ], Object.assign({}, MD_L, { assistantName: "小助" }));
  assert.ok(md.startsWith("# 测试会话\n"));
  assert.ok(md.includes("- 助手：小助"));
  assert.ok(md.includes("- 工作区：C:\\ws\\a"));
  assert.ok(md.includes("- 消息数：2"));
  assert.ok(md.includes("## 你\n\nhi"));
  assert.ok(md.includes("---\n\n## 助手\n\nyo"));
  const empty = P.sessionToMarkdown({ id: "s2" }, [], Object.assign({}, MD_L, { assistantName: "x" }));
  assert.ok(empty.includes("- 消息数：0"));
  assert.ok(!empty.includes("## 你"));
});

test("outlineSnippet collapses whitespace and truncates with ellipsis", () => {
  assert.strictEqual(P.outlineSnippet("  hello \n\n world  "), "hello world");
  assert.strictEqual(P.outlineSnippet("a".repeat(80)).length, 65);
  assert.strictEqual(P.outlineSnippet("a".repeat(80)).endsWith("…"), true);
  assert.strictEqual(P.outlineSnippet("short", 10), "short");
  assert.strictEqual(P.outlineSnippet(null), "");
  assert.strictEqual(P.outlineSnippet("abcdef", 3), "abc…");
  assert.strictEqual(P.outlineSnippet("abcdef", 0), "abcdef");
});

test("outlineItems condenses roles, tools and strips user send stamp", () => {
  const items = P.outlineItems([
    { info: { id: "u1", role: "user" }, parts: [{ type: "text", text: "你好\n\n[发送时间：2026-01-01 00:00:00]" }] },
    { info: { id: "a1", role: "assistant" }, parts: [
      { type: "text", text: "第一段" },
      { type: "text", text: "第二段" },
      { type: "tool", tool: "bash" },
      { type: "tool", tool: "bash" },
      { type: "file", mime: "image/png" },
      { type: "reasoning", text: "思考中" },
    ] },
    { info: { id: "a2", role: "assistant" }, parts: [{ type: "text", text: "", synthetic: true }] },
  ]);
  assert.deepStrictEqual(items.map((x) => x.id), ["u1", "a1", "a2"]);
  assert.strictEqual(items[0].role, "user");
  assert.strictEqual(items[0].text, "你好");
  assert.deepStrictEqual(items[1].tools, ["bash", "file"]);
  assert.strictEqual(items[1].text, "第一段 第二段");
  assert.strictEqual(items[2].text, "");
});

test("ggufAlias derives a safe model id from a file path", () => {
  assert.strictEqual(P.ggufAlias("D:\\models\\Qwen2.5-7B-Instruct.Q4_K_M.gguf"), "Qwen2.5-7B-Instruct.Q4_K_M");
  assert.strictEqual(P.ggufAlias("/home/u/my model.gguf"), "my-model");
  assert.strictEqual(P.ggufAlias(""), "local-model");
  assert.strictEqual(P.ggufAlias("....gguf"), "local-model");
  assert.strictEqual(P.ggufAlias("a".repeat(100) + ".gguf").length, 64);
});

test("localRuntimeLabel summarizes the installed runtime", () => {
  assert.strictEqual(P.localRuntimeLabel(null), "未安装");
  assert.strictEqual(P.localRuntimeLabel({ installed: false }), "未安装");
  assert.strictEqual(P.localRuntimeLabel({ installed: true, variant: "cuda", tag: "b11105" }), "CUDA · b11105");
  assert.strictEqual(P.localRuntimeLabel({ installed: true, variant: "cpu" }), "CPU");
});

test("localProgressText renders install progress", () => {
  assert.strictEqual(P.localProgressText(null), "");
  assert.strictEqual(P.localProgressText({ state: "ready", variant: "cuda" }), "运行时就绪（cuda）");
  assert.ok(P.localProgressText({ installing: true, state: "downloading", received: 50, total: 100 }).includes("50%"));
  assert.ok(P.localProgressText({ installing: true, state: "downloading", received: 1048576, total: 0 }).includes("1 MB"));
  assert.ok(P.localProgressText({ installing: true, state: "extracting" }).includes("解压"));
  assert.ok(P.localProgressText({ state: "error", error: "boom" }).includes("boom"));
});

test("mediaKindOf buckets mime types", () => {
  assert.strictEqual(P.mediaKindOf("image/png"), "image");
  assert.strictEqual(P.mediaKindOf("image/jpeg"), "image");
  assert.strictEqual(P.mediaKindOf("video/mp4"), "video");
  assert.strictEqual(P.mediaKindOf("audio/mpeg"), "audio");
  assert.strictEqual(P.mediaKindOf("application/pdf"), "pdf");
  assert.strictEqual(P.mediaKindOf("text/plain"), "file");
  assert.strictEqual(P.mediaKindOf(""), "file");
  assert.strictEqual(P.mediaKindOf(null), "file");
});

test("mediaItemKey is stable, typed and url-sensitive", () => {
  assert.strictEqual(P.mediaItemKey("image/png", "data:abc"), P.mediaItemKey("image/png", "data:abc"));
  assert.notStrictEqual(P.mediaItemKey("image/png", "data:abc"), P.mediaItemKey("image/png", "data:xyz"));
  assert.ok(P.mediaItemKey("image/png", "u").startsWith("image|"));
  assert.ok(P.mediaItemKey("application/pdf", "u").startsWith("pdf|"));
});

test("mediaItemsFromParts extracts file parts and tool attachments", () => {
  const parts = [
    { type: "text", text: "hi" },
    { type: "file", mime: "image/png", filename: "a.png", url: "data:image/png;base64,AAAA" },
    { type: "tool", state: { attachments: [{ mime: "image/jpeg", filename: "b.jpg", url: "/file/b" }, { url: "" }] } },
    { type: "tool", state: { attachments: null } },
  ];
  const items = P.mediaItemsFromParts(parts, {
    sessionId: "s1", sessionTitle: "会话一", directory: "C:\\ws", messageId: "m1", role: "assistant", at: 123,
  });
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].name, "a.png");
  assert.strictEqual(items[0].kind, "image");
  assert.strictEqual(items[0].source, "assistant");
  assert.strictEqual(items[0].sessionId, "s1");
  assert.strictEqual(items[0].directory, "C:\\ws");
  assert.strictEqual(items[0].at, 123);
  assert.strictEqual(items[1].name, "b.jpg");
  assert.strictEqual(items[1].url, "/file/b");
});

test("mediaItemsFromParts marks user role as source user", () => {
  const items = P.mediaItemsFromParts([{ type: "file", mime: "image/png", url: "x" }], { role: "user" });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].source, "user");
});

test("mediaItemsFromParts tolerates empty input", () => {
  assert.deepStrictEqual(P.mediaItemsFromParts(null, null), []);
  assert.deepStrictEqual(P.mediaItemsFromParts([], {}), []);
  assert.deepStrictEqual(P.mediaItemsFromParts([{ type: "file" }], {}), []);
});

test("mediaFilter filters by kind, source and query terms", () => {
  const items = [
    { id: "1", kind: "image", source: "user", name: "cat.png", sessionTitle: "日常", mime: "image/png" },
    { id: "2", kind: "image", source: "assistant", name: "dog.jpg", sessionTitle: "工作", mime: "image/jpeg" },
    { id: "3", kind: "pdf", source: "user", name: "report.pdf", sessionTitle: "工作", mime: "application/pdf" },
  ];
  assert.strictEqual(P.mediaFilter(items, {}).length, 3);
  assert.strictEqual(P.mediaFilter(items, { kind: "image" }).length, 2);
  assert.strictEqual(P.mediaFilter(items, { source: "user" }).length, 2);
  assert.strictEqual(P.mediaFilter(items, { source: "assistant" })[0].id, "2");
  assert.strictEqual(P.mediaFilter(items, { query: "dog" })[0].id, "2");
  assert.strictEqual(P.mediaFilter(items, { query: "工作" }).length, 2);
  assert.strictEqual(P.mediaFilter(items, { query: "工作 pdf" })[0].id, "3");
  assert.strictEqual(P.mediaFilter(items, { kind: "image", source: "user" })[0].id, "1");
  assert.strictEqual(P.mediaFilter(items, { query: "nope" }).length, 0);
  assert.deepStrictEqual(P.mediaFilter(null, {}), []);
});

test("mediaArchiveSummary counts and sums sizes", () => {
  assert.deepStrictEqual(P.mediaArchiveSummary(null), { count: 0, bytes: 0 });
  const s = P.mediaArchiveSummary([{ size: 100 }, { size: 250 }, {}]);
  assert.strictEqual(s.count, 3);
  assert.strictEqual(s.bytes, 350);
});



