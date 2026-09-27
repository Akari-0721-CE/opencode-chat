/* ============ 会话导出为 Markdown ============ */
const MD_TOOL_OUTPUT_LIMIT = 4000;

function mdFileName(title) {
  let s = String(title || "").replace(/[\\/:*?"<>|\r\n\t]/g, "-").replace(/\s+/g, " ").replace(/^[\s.\-]+|[\s.\-]+$/g, "");
  if (!s) s = "session";
  if (s.length > 60) s = s.slice(0, 60).replace(/[\s.\-]+$/, "");
  return s;
}

function mdFence(text) {
  const runs = String(text).match(/`{3,}/g);
  const fence = runs && runs.length ? "`".repeat(Math.max(...runs.map(x => x.length)) + 1) : "```";
  return fence + "\n" + String(text) + "\n" + fence;
}

function mdBlockquote(text) {
  return String(text).split("\n").map(l => (l ? "> " + l : ">")).join("\n");
}

function exportLabels() {
  const T = (s) => (typeof t === "function" ? t(s) : s);
  return {
    session: T("会话"),
    assistant: T("助手"),
    workspace: T("工作区"),
    exportedAt: T("导出时间"),
    messageCount: T("消息数"),
    you: T("你"),
    thinking: T("思考"),
    tool: T("工具"),
    image: T("图片"),
    file: T("文件"),
    truncated: T("（输出过长，已截断）"),
  };
}

function mdTool(part, L) {
  const name = (typeof toolInfo === "function") ? toolInfo(part.tool).name : (part.tool || L.tool);
  const summary = (typeof toolSummaryText === "function") ? String(toolSummaryText(part) || "") : "";
  const inline = summary ? " `" + summary.replace(/`/g, "'").replace(/\s+/g, " ").slice(0, 200) + "`" : "";
  const out = ["**" + L.tool + "：" + name + "**" + inline];
  const st = (part.state && part.state.output) || "";
  if (st) {
    const clipped = String(st).length > MD_TOOL_OUTPUT_LIMIT
      ? String(st).slice(0, MD_TOOL_OUTPUT_LIMIT) + "\n" + L.truncated
      : String(st);
    out.push(mdFence(clipped));
  }
  return out.join("\n\n");
}

function messageToMarkdown(msg, opts) {
  const L = opts || exportLabels();
  const info = (msg && msg.info) || msg || {};
  const parts = (msg && msg.parts) || [];
  const blocks = [];
  for (const p of parts) {
    if (!p) continue;
    if (p.type === "text") {
      let txt = p.text || "";
      if (info.role === "user" && typeof splitSendStamp === "function") txt = splitSendStamp(txt).body;
      if (String(txt).trim()) blocks.push(String(txt).trim());
    } else if (p.type === "reasoning") {
      const r = String(p.text || "").trim();
      if (r) blocks.push("**" + L.thinking + "**\n\n" + mdBlockquote(r));
    } else if (p.type === "tool") {
      blocks.push(mdTool(p, L));
    } else if (p.type === "file") {
      const nm = p.filename || p.mime || L.file;
      const isImg = String(p.mime || "").startsWith("image/");
      blocks.push("[" + (isImg ? L.image : L.file) + "：" + nm + "]");
    }
  }
  if (!blocks.length) return "";
  return "## " + (info.role === "user" ? L.you : L.assistant) + "\n\n" + blocks.join("\n\n");
}

function sessionToMarkdown(session, messages, opts) {
  const L = opts || exportLabels();
  const s = session || {};
  const list = (messages || []).map(m => messageToMarkdown(m, L)).filter(Boolean);
  const meta = [];
  if (opts && opts.assistantName) meta.push("- " + L.assistant + "：" + opts.assistantName);
  if (s.directory) meta.push("- " + L.workspace + "：" + s.directory);
  meta.push("- " + L.exportedAt + "：" + (typeof fmtSendStamp === "function" ? fmtSendStamp(new Date()) : ""));
  meta.push("- " + L.messageCount + "：" + list.length);
  const body = list.join("\n\n---\n\n");
  return "# " + (s.title || s.id || L.session) + "\n\n" + meta.join("\n") + "\n\n" +
    (body ? "---\n\n" + body + "\n" : "");
}

/* ---------- 下载与交互 ---------- */
function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportSessionMarkdown(s, silent) {
  if (!s || !s.id) return;
  const tr = (x) => (typeof t === "function" ? t(x) : x);
  try {
    const msgs = await api("/session/" + s.id + "/message", { directory: s.directory || activeDir });
    const a = (typeof assistantForDir === "function") ? assistantForDir(s.directory) : null;
    const md = sessionToMarkdown(s, msgs, Object.assign(exportLabels(), { assistantName: a ? (a.name || "") : "" }));
    downloadText(mdFileName(s.title || s.id) + ".md", md);
    if (!silent) showToast(tr("已导出 Markdown：") + (s.title || s.id));
  } catch (e) {
    showToast(tr("导出失败：") + e.message, true);
  }
}

async function exportAllSessionsMarkdown() {
  const a = (typeof activeAssistant === "function") ? activeAssistant() : null;
  if (!a) { showToast(t("还没有助手，先新建一个吧"), true); return; }
  const list = (sessionsCache || []).slice();
  if (!list.length) { showToast(t("暂无会话"), true); return; }
  const tr = (x) => (typeof t === "function" ? t(x) : x);
  const tfx = (x, ...v) => (typeof tf === "function" ? tf(x, ...v) : x);
  showToast(tfx("正在导出 {0} 个会话…", list.length));
  const docs = [];
  let failed = 0;
  const labels = Object.assign(exportLabels(), { assistantName: a.name || "" });
  for (const s of list) {
    try {
      const msgs = await api("/session/" + s.id + "/message", { directory: s.directory || a.directory });
      docs.push(sessionToMarkdown(s, msgs, labels));
    } catch (e) {
      failed++;
    }
  }
  if (!docs.length) { showToast(tr("导出失败：") + "0", true); return; }
  const md = docs.join("\n\n---\n\n") + "\n";
  downloadText(mdFileName(a.name || "assistant") + "-" + tr("会话") + ".md", md);
  showToast(failed ? tfx("已导出 {0} 个会话，{1} 个失败", docs.length, failed) : tfx("已导出 {0} 个会话", docs.length), !!failed);
}

if ($("exportAllSessions")) {
  $("exportAllSessions").appendChild(iconEl("down"));
  $("exportAllSessions").onclick = exportAllSessionsMarkdown;
}
