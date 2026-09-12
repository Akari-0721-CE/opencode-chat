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

const MARKED_URL = "/vendor/marked.min.js";
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
const HLJS_URL = "/vendor/highlight.min.js";
const HLJS_CSS = "/vendor/highlight-github-dark.min.css";
const KATEX_URL = "/vendor/katex.min.js";
const KATEX_CSS = "/vendor/katex.min.css";

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
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ============ 工具说明（面向小白） ============ */
const TOOL_INFO = {
  bash:        { name: "运行命令", desc: "在电脑上执行终端命令（编译、脚本、git 等）。" },
  read:        { name: "读取文件", desc: "读取文件或列出一个目录的内容。" },
  write:       { name: "新建 / 覆盖文件", desc: "创建文件，或整体覆盖写入新内容。" },
  edit:        { name: "编辑文件", desc: "按「查找 → 替换」精确修改文件里的内容。" },
  glob:        { name: "查找文件", desc: "按文件名 / 通配符（如 *.ts）找文件。" },
  grep:        { name: "搜索内容", desc: "在文件内容里搜索关键字或正则。" },
  task:        { name: "派生子任务", desc: "交给子智能体处理复杂、多步骤的工作。" },
  webfetch:    { name: "抓取网页", desc: "读取指定网址的网页并转成文本。" },
  websearch:   { name: "联网搜索", desc: "用搜索引擎查找最新资料。" },
  todowrite:   { name: "待办清单", desc: "创建 / 更新本次任务的待办列表。" },
  question:    { name: "向你提问", desc: "需要你确认或做选择时弹出问题。" },
  skill:       { name: "技能", desc: "加载并使用已安装的技能包。" },
  apply_patch: { name: "应用补丁", desc: "以补丁（diff）形式修改文件。" },
};
function toolInfo(id) {
  const info = TOOL_INFO[id] || { name: id || "工具", desc: "" };
  return {
    name: (typeof t === "function") ? t(info.name) : info.name,
    desc: (typeof t === "function") ? t(info.desc) : info.desc,
  };
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

/* ============ 最近错误（可观测性） ============ */
const recentErrors = [];
const ERR_MAX = 50;
function fmtErrTime(ms) {
  try { return new Date(ms).toLocaleTimeString("zh-CN", { hour12: false }); } catch (e) { return ""; }
}
function renderErrorLog() {
  const box = $("errLog");
  if (!box) return;
  box.innerHTML = "";
  if (!recentErrors.length) { box.appendChild(el("div", "hint", "暂无错误")); return; }
  for (let i = recentErrors.length - 1; i >= 0; i--) {
    const e = recentErrors[i];
    const row = el("div", "err-row");
    row.appendChild(el("span", "err-time", fmtErrTime(e.at)));
    row.appendChild(el("span", "err-scope", e.scope));
    row.appendChild(el("span", "err-msg", e.message));
    box.appendChild(row);
  }
}
function pushError(scope, message) {
  const msg = String(message == null ? "" : message).slice(0, 500);
  if (!msg) return;
  const last = recentErrors[recentErrors.length - 1];
  if (last && last.scope === scope && last.message === msg && Date.now() - last.at < 3000) return;
  recentErrors.push({ at: Date.now(), scope: scope || "app", message: msg });
  while (recentErrors.length > ERR_MAX) recentErrors.shift();
  renderErrorLog();
}
window.addEventListener("error", (e) => {
  if (e && e.message) pushError("js", e.message + (e.filename ? " @ " + e.filename + ":" + (e.lineno || 0) : ""));
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e && e.reason;
  pushError("promise", (r && r.message) ? r.message : String(r));
});

/* ============ 模态可访问性（aria + Escape + 焦点陷阱） ============ */
const MODAL_ESC = {
  profileMask: "profileDone",
  settingsMask: null,
  assistantMask: "astCancel",
  promptMask: "promptCancel",
  editMsgMask: "editMsgCancel",
  cropMask: "cropCancel",
  provKeyMask: "provKeyCancel",
  dirMask: "dirCancel",
  searchMask: "searchClose",
  ocrMask: "ocrClose",
  providerMask: "providerClose",
  choiceMask: "choiceCancel",
  confirmMask: "confirmCancel",
  cleanupMask: "cleanupClose",
  oauthMask: "oauthCancel",
  favMask: "favClose",
  trashMask: "trashClose",
  editorMask: "editorCancel",
  permMask: undefined,
};
function visibleModalMask() {
  const list = document.querySelectorAll(".modal-mask.show");
  if (!list.length) return null;
  let top = list[0];
  let topZ = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    let z = i;
    try {
      const g = getComputedStyle(m);
      const raw = parseFloat((g && g.zIndex) || "0");
      if (isFinite(raw)) z = raw;
    } catch (e) { /* keep DOM order */ }
    if (z >= topZ) { topZ = z; top = m; }
  }
  return top;
}
function modalFocusables(root) {
  const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.prototype.filter.call(root.querySelectorAll(sel), (e) => {
    return e.offsetParent !== null || e === document.activeElement;
  });
}
function initModalA11y() {
  document.querySelectorAll(".modal-mask").forEach((mask) => {
    const modal = mask.querySelector(".modal");
    if (!modal) return;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
  });
  document.addEventListener("keydown", (e) => {
    const mask = visibleModalMask();
    if (!mask) return;
    if (e.key === "Escape") {
      if (!Object.prototype.hasOwnProperty.call(MODAL_ESC, mask.id)) return;
      const btnId = MODAL_ESC[mask.id];
      if (btnId === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      if (btnId) { const b = $(btnId); if (b) { b.click(); return; } }
      mask.classList.remove("show");
      return;
    }
    if (e.key === "Tab") {
      const modal = mask.querySelector(".modal") || mask;
      const items = modalFocusables(modal);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (!modal.contains(active)) { e.preventDefault(); first.focus(); }
    }
  }, true);
}
initModalA11y();

/* ============ 通用确认弹窗 ============ */
let confirmResolve = null;
function confirmDialog(opts) {
  const o = typeof opts === "string" ? { text: opts } : (opts || {});
  $("confirmTitle").textContent = o.title || "确认";
  const text = $("confirmText");
  text.textContent = o.text || "";
  text.style.display = o.text ? "" : "none";
  const ok = $("confirmOk");
  ok.textContent = o.okText || "确定";
  ok.className = o.danger ? "btn-reject" : "btn-allow";
  return new Promise((resolve) => {
    confirmResolve = resolve;
    $("confirmMask").classList.add("show");
    setTimeout(() => ok.focus(), 30);
  });
}
function closeConfirm(val) {
  if (!confirmResolve) return;
  $("confirmMask").classList.remove("show");
  const r = confirmResolve;
  confirmResolve = null;
  r(val);
}
$("confirmOk").onclick = () => closeConfirm(true);
$("confirmCancel").onclick = () => closeConfirm(false);
$("confirmMask").addEventListener("click", (e) => { if (e.target === $("confirmMask")) closeConfirm(false); });

/* ============ 范围滑杆填充 ============ */
function syncRangeFill(el) {
  if (!el || el.type !== "range") return;
  const min = parseFloat(el.min || "0");
  const max = parseFloat(el.max || "100");
  const v = parseFloat(el.value || "0");
  const pct = max > min ? Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100)) : 0;
  el.style.setProperty("--range-fill", pct + "%");
}
function initRangeFills() {
  document.querySelectorAll('input[type=range]').forEach(syncRangeFill);
  document.addEventListener("input", (e) => {
    if (e.target && e.target.type === "range") syncRangeFill(e.target);
  }, true);
}

/* ============ 主题色 ============ */
const ACCENT_PRESETS = [
  { id: "green",  name: "青绿",   accent: "#10a37f", soft: "#14b891", strong: "#0d8f6f", bright: "#16e0b0" },
  { id: "blue",   name: "海蓝",   accent: "#3b82f6", soft: "#60a5fa", strong: "#2563eb", bright: "#7dd3fc" },
  { id: "indigo", name: "靛紫",   accent: "#8b5cf6", soft: "#a78bfa", strong: "#7c3aed", bright: "#c4b5fd" },
  { id: "pink",   name: "樱粉",   accent: "#ec4899", soft: "#f472b6", strong: "#db2777", bright: "#f9a8d4" },
  { id: "orange", name: "日落橙", accent: "#f97316", soft: "#fb923c", strong: "#ea580c", bright: "#fdba74" },
  { id: "red",    name: "绯红",   accent: "#ef4444", soft: "#f87171", strong: "#dc2626", bright: "#fca5a5" },
  { id: "cyan",   name: "青碧",   accent: "#06b6d4", soft: "#22d3ee", strong: "#0891b2", bright: "#67e8f9" },
  { id: "slate",  name: "石墨",   accent: "#64748b", soft: "#94a3b8", strong: "#475569", bright: "#cbd5e1" },
];
function hexToRgba(hex, a) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (!isFinite(n)) return "rgba(0,0,0," + a + ")";
  return "rgba(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + a + ")";
}
function accentPreset(id) {
  return ACCENT_PRESETS.find((p) => p.id === id) || ACCENT_PRESETS[0];
}
function applyAccent(id) {
  const p = accentPreset(id);
  const root = document.documentElement.style;
  root.setProperty("--accent", p.accent);
  root.setProperty("--accent-soft", p.soft);
  root.setProperty("--accent-strong", p.strong);
  root.setProperty("--accent-bright", p.bright);
  root.setProperty("--accent-weak", hexToRgba(p.accent, 0.18));
  root.setProperty("--accent-glow", hexToRgba(p.accent, 0.5));
  root.setProperty("--focus", "0 0 0 3px " + hexToRgba(p.accent, 0.30));
  root.setProperty("--user-bubble", p.accent);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", p.accent);
  try { localStorage.setItem("oc_accent", p.id); } catch (e) {}
}
applyAccent(localStorage.getItem("oc_accent") || "green");

/* ============ 外观模式（亮色 / 暗色 / 跟随系统） ============ */
const THEME_KEY = "oc_theme";
function systemPrefersDark() {
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function themeMode() {
  const v = localStorage.getItem(THEME_KEY);
  return v === "dark" || v === "auto" ? v : "light";
}
function isDarkMode(mode) {
  const m = mode || themeMode();
  return m === "dark" || (m === "auto" && systemPrefersDark());
}
function renderThemeSeg(mode) {
  const seg = $("themeSeg");
  if (!seg) return;
  seg.querySelectorAll(".seg-btn").forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });
}
function applyThemeMode(mode) {
  const m = mode === "dark" || mode === "auto" ? mode : "light";
  const dark = isDarkMode(m);
  document.body.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  try { localStorage.setItem(THEME_KEY, m); } catch (e) {}
  renderThemeSeg(m);
}
function initThemeMode() {
  const seg = $("themeSeg");
  if (seg) {
    seg.addEventListener("click", (e) => {
      const b = e.target && e.target.closest ? e.target.closest(".seg-btn") : null;
      if (b) applyThemeMode(b.dataset.mode);
    });
  }
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  if (mq) {
    const onChange = () => { if (themeMode() === "auto") applyThemeMode("auto"); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  applyThemeMode(themeMode());
}
initThemeMode();

/* ============ 渲染质量（性能优先 / 标准 / 高质量） ============ */
const QUALITY_KEY = "oc_render_quality";
const QUALITY_LEVELS = ["low", "standard", "high"];
function renderQuality() {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (QUALITY_LEVELS.indexOf(v) >= 0) return v;
    if (localStorage.getItem("oc_low_perf") === "1") return "low";
  } catch (e) { /* ignore */ }
  return "standard";
}
function applyRenderQuality(level) {
  const q = QUALITY_LEVELS.indexOf(level) >= 0 ? level : renderQuality();
  const b = document.body;
  b.classList.toggle("quality-low", q === "low");
  b.classList.toggle("quality-high", q === "high");
  b.classList.toggle("low-perf", q === "low");
}
function setRenderQuality(level) {
  const q = QUALITY_LEVELS.indexOf(level) >= 0 ? level : "standard";
  try { localStorage.setItem(QUALITY_KEY, q); } catch (e) { /* ignore */ }
  applyRenderQuality(q);
  if (typeof applyBackgroundQuality === "function") applyBackgroundQuality(q);
  if (typeof rerenderCurrentMessages === "function") rerenderCurrentMessages();
  if (typeof saveProfile === "function") saveProfile();
}
function lowPerfEnabled() { return renderQuality() === "low"; }
applyRenderQuality(renderQuality());

/* ============ 桌面通知 ============ */
function canNotify(hidden, enabled, permission) {
  return !!enabled && permission === "granted" && !!hidden;
}
function notifyEnabled() {
  try { return localStorage.getItem("oc_notify") === "1"; } catch (e) { return false; }
}
function notifyDesktop(title, body, tag) {
  try {
    if (typeof Notification === "undefined") return false;
    if (!canNotify(document.hidden, notifyEnabled(), Notification.permission)) return false;
    const n = new Notification(title, { body: body || "", tag: tag || "oc-notify", icon: "/favicon.ico" });
    n.onclick = () => { try { window.focus(); } catch (e) {} try { n.close(); } catch (e) {} };
    return true;
  } catch (e) { return false; }
}

/* ============ 全局快捷键 ============ */
function initShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && e.key === ",") {
      e.preventDefault();
      const b = $("settingsBtn");
      if (b) b.click();
      return;
    }
    if (e.altKey && !mod && !e.shiftKey && (e.key === "n" || e.key === "N")) {
      e.preventDefault();
      const b = $("newSession");
      if (b && !b.disabled) b.click();
      return;
    }
    if (e.key === "Escape" && !document.querySelector(".modal-mask.show")) {
      if (typeof busy !== "undefined" && busy && typeof stop === "function") { e.preventDefault(); stop(); }
    }
  });
}
initShortcuts();

/* ============ 行内交互（键盘 / 触屏辅助） ============ */
function makeRowInteractive(node, activate) {
  if (!node) return;
  node.tabIndex = 0;
  node.addEventListener("keydown", (e) => {
    if (e.target !== node) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (typeof activate === "function") activate();
      else node.click();
    }
  });
}
function syncAriaLabels(root) {
  const nodes = (root || document).querySelectorAll("button[title]:not([aria-label])");
  nodes.forEach((b) => b.setAttribute("aria-label", b.getAttribute("title") || ""));
}
syncAriaLabels(document);


