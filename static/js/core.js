/* ============ 基础工具 ============ */
const $ = (id) => document.getElementById(id);
const treeEl = $("tree");
const sessionList = $("sessionList");
const messagesEl = $("messages");
const input = $("input");
const DRAFT_KEY = "oc_drafts";
function draftStore() {
  try {
    const o = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    return o && typeof o === "object" ? o : {};
  } catch (e) { return {}; }
}
function saveDraft(sid, text) {
  if (!sid) return;
  const m = draftStore();
  if (text && text.trim()) m[sid] = text;
  else delete m[sid];
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(m)); } catch (e) {}
}
function loadDraft(sid) {
  if (!sid) return "";
  return draftStore()[sid] || "";
}
function dropDraft(sid) {
  if (!sid) return;
  const m = draftStore();
  if (m[sid] !== undefined) {
    delete m[sid];
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(m)); } catch (e) {}
  }
}
const REPLIES_KEY = "oc_replies";
function repliesStore() {
  try {
    const o = JSON.parse(localStorage.getItem(REPLIES_KEY) || "{}");
    return o && typeof o === "object" ? o : {};
  } catch (e) { return {}; }
}
function saveReplies(o) {
  try { localStorage.setItem(REPLIES_KEY, JSON.stringify(o)); } catch (e) {}
}
function textHash(s) {
  let h = 5381;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function turnKey(sid, userText) {
  return sid + "|" + textHash(userText);
}
function messageTextParts(m) {
  return ((m && m.parts) || []).filter(p => p.type === "text" && p.text).map(p => p.text).join("\n\n").trim();
}
function addReplyVersion(sid, userText, text) {
  if (!sid || !userText || !text) return;
  const o = repliesStore();
  const k = turnKey(sid, userText);
  const arr = Array.isArray(o[k]) ? o[k] : [];
  arr.push({ text, time: Date.now() });
  while (arr.length > 8) arr.shift();
  o[k] = arr;
  const keys = Object.keys(o);
  if (keys.length > 120) {
    keys.sort((a, b) => {
      const ta = (o[a][o[a].length - 1] || {}).time || 0;
      const tb = (o[b][o[b].length - 1] || {}).time || 0;
      return ta - tb;
    });
    for (let i = 0; i < keys.length - 120; i++) delete o[keys[i]];
  }
  saveReplies(o);
}
const sendBtn = $("send");
const stopBtn = $("stop");
const modelSelect = $("modelSelect");
const variantSelect = $("variantSelect");
const sessionsName = $("sessionsName");
const newSessionBtn = $("newSession");
const attachBtn = $("attachBtn");
const fileInput = $("fileInput");
const attachmentsEl = $("attachments");
const dropOverlay = $("dropOverlay");
const toastEl = $("toast");

const MARKED_URL = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
const BASE_OVERRIDE_MARK = "[[OC_BASE_OVERRIDE]]";
const PARAMS_MARK = "[[OC_PARAMS]]";
const GIT_SAFE_RULE = [
  "【Git 安全规则（必须遵守）】在执行任何 git add / git commit / git push 之前，必须按顺序：",
  "1) 先运行 git status、git diff（必要时 git diff --cached）以及 git log，列出将要提交/推送的文件与改动；",
  "2) 检查改动中是否包含密钥、令牌、密码、.env、凭证文件、隐私数据、无关的大文件或二进制（如 *.exe、浏览器配置、缓存）；",
  "3) 把待提交文件清单和风险点展示给用户，并等待用户明确确认后才可继续；",
  "4) 未经用户确认，禁止直接 commit 或 push；发现可疑文件时先停下来询问用户，不要自行处理。",
].join("\n");
const PURE_STAMP_RE = /\n*\[发送时间[:：][^\]]*\]\s*$/;
function fmtSendStamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
    p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
function withSendStamp(text) {
  const clean = String(text || "").replace(PURE_STAMP_RE, "").replace(/\s+$/, "");
  const stamp = "[发送时间：" + fmtSendStamp(new Date()) + "]";
  return clean ? clean + "\n\n" + stamp : stamp;
}
function stampParts(parts) {
  const out = parts.map(p => Object.assign({}, p));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].type === "text") { out[i].text = withSendStamp(out[i].text); break; }
  }
  return out;
}
function splitSendStamp(text) {
  const s = String(text || "");
  const m = s.match(PURE_STAMP_RE);
  if (!m) return { body: s, stamp: "" };
  return { body: s.slice(0, m.index).replace(/\s+$/, ""), stamp: m[0].trim() };
}
function applyUserStamp(bubble, text) {
  const sp = splitSendStamp(text);
  bubble.__raw = sp.body;
  renderMarkdown(bubble, sp.body);
  let stampEl = bubble.nextElementSibling;
  if (!stampEl || !stampEl.classList || !stampEl.classList.contains("msg-stamp")) {
    stampEl = el("div", "msg-stamp");
    bubble.parentNode.insertBefore(stampEl, bubble.nextSibling);
  }
  stampEl.textContent = sp.stamp;
  stampEl.style.display = sp.stamp ? "" : "none";
}
const HLJS_URL = "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/highlight.min.js";
const HLJS_CSS = "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/styles/github-dark.min.css";
const KATEX_URL = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js";
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";

const ICON = {
  chevron: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  starFill: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function modelKey(providerID, id) {
  return JSON.stringify([String(providerID), String(id)]);
}
function parseModelKey(v) {
  try {
    const arr = JSON.parse(v);
    if (Array.isArray(arr) && arr.length === 2) return { providerID: String(arr[0]), id: String(arr[1]) };
  } catch (e) { /* ignore */ }
  return null;
}
function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function iconEl(name) {
  const s = el("span");
  s.innerHTML = ICON[name];
  return s.firstChild;
}
function avatarColor(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return "hsl(" + h + ",52%,48%)";
}

