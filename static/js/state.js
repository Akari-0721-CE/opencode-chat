/* ============ API ============ */
let activeDir = null;

async function api(path, opts = {}) {
  const { directory, noDir, headers, ...init } = opts || {};
  const dir = directory !== undefined ? directory : activeDir;
  const h = Object.assign({}, headers);
  if (Object.keys(h).length) init.headers = h;
  let url = "/api" + path;
  if (dir && !noDir) url += (url.includes("?") ? "&" : "?") + "directory=" + encodeURIComponent(dir);
  let res;
  try { res = await fetch(url, init); }
  catch (e) { pushError("api", path + " 网络错误：" + e.message); throw e; }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 500); } catch (e) { /* ignore */ }
    pushError("api", path + " -> " + res.status + (detail ? " " + detail.slice(0, 120) : ""));
    throw new Error(path + " -> " + res.status + (detail ? " " + detail : ""));
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return res.json();
  return res.text();
}

function normDir(p) {
  return String(p || "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

/* ============ 状态 ============ */
const STORE_KEY = "oc_workspace_v2";
const S = { folders: [], assistants: [], activeId: null, last: {}, favorites: [], usedDirs: [], trash: [] };
let defaultModel = null;
try { defaultModel = JSON.parse(localStorage.getItem("oc_model") || "null"); } catch (e) { defaultModel = null; }

let currentSession = null;
let sessionsCache = [];
let busy = false;
let eventSource = null;
let eventsDir = null;
let msgEls = {};
let partEls = {};
let dirtyMsgIds = new Set();
let pendingPerms = [];
let pendingQuestions = [];
const questionByCall = {};
const questionResultByCall = {};
let modelsByProvider = [];
let agentsCache = [];
let allToolIds = [];
let serverDefaultModel = null;
let attachments = [];
let homeDir = "";
let astDirAuto = true;
let astAvatarData = "";
let pendingScrollMessageId = null;
let sessionMessages = [];
let sessionRenderStart = 0;

function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(S));
}
function markDirUsed(dir) {
  const key = normDir(dir);
  if (!key) return;
  if (!S.usedDirs.includes(key)) S.usedDirs.push(key);
}
function seedUsedDirs() {
  if (!Array.isArray(S.usedDirs)) S.usedDirs = [];
  for (const a of S.assistants) markDirUsed(a.directory);
}
function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (raw && Array.isArray(raw.assistants)) {
      S.folders = raw.folders || [];
      S.assistants = raw.assistants || [];
      S.activeId = raw.activeId || null;
      S.last = raw.last || {};
      S.favorites = Array.isArray(raw.favorites) ? raw.favorites : [];
      S.trash = Array.isArray(raw.trash) ? raw.trash : [];
      S.usedDirs = [];
      if (Array.isArray(raw.usedDirs)) for (const d of raw.usedDirs) markDirUsed(d);
    }
  } catch (e) { /* ignore */ }
  seedUsedDirs();
}
function activeAssistant() {
  return S.assistants.find(a => a.id === S.activeId) || null;
}
function isTrashed(sessionId) {
  return (Array.isArray(S.trash) ? S.trash : []).some(t => t.id === sessionId);
}
function assistantForDir(dir) {
  const key = normDir(dir);
  return S.assistants.find(a => normDir(a.directory) === key) || null;
}

/* ============ 本地数据自动备份（落盘到服务器） ============ */
const PROFILE_PREFIX = "oc_";
function snapshotLocalStorage() {
  const o = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(PROFILE_PREFIX) === 0) o[k] = localStorage.getItem(k);
    }
  } catch (e) { /* ignore */ }
  return o;
}
let lastProfileJson = "";
let profileTimer = null;
async function saveProfile(force) {
  const snap = snapshotLocalStorage();
  const json = JSON.stringify(snap);
  if (!force && json === lastProfileJson) return;
  const prev = lastProfileJson;
  lastProfileJson = json;
  try {
    await api("/_profile", {
      method: "POST", noDir: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: snap }),
    });
  } catch (e) {
    if (lastProfileJson === json) lastProfileJson = prev;
  }
}
function flushProfile() {
  const snap = snapshotLocalStorage();
  const json = JSON.stringify(snap);
  if (json === lastProfileJson) return;
  lastProfileJson = json;
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify({ data: snap })], { type: "application/json" });
      if (navigator.sendBeacon("/api/_profile", blob)) return;
    }
  } catch (e) { /* fall through */ }
  saveProfile(true);
}
function initProfileAutosave() {
  if (profileTimer) return;
  lastProfileJson = JSON.stringify(snapshotLocalStorage());
  profileTimer = setInterval(() => { saveProfile(); }, 4000);
  window.addEventListener("beforeunload", flushProfile);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushProfile(); });
}
async function restoreProfile() {
  try {
    if (localStorage.getItem(STORE_KEY)) return false;
    const r = await api("/_profile", { noDir: true });
    const data = r && r.data;
    if (!data || typeof data !== "object") return false;
    let n = 0;
    for (const k in data) {
      if (k.indexOf(PROFILE_PREFIX) === 0 && typeof data[k] === "string") { localStorage.setItem(k, data[k]); n++; }
    }
    return n > 0;
  } catch (e) { return false; }
}
function exportProfile() {
  const payload = { app: "opencode-chat", version: 1, exportedAt: Date.now(), data: snapshotLocalStorage() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "opencode-chat-backup-" + fmtSendStamp(new Date()).replace(/[: ]/g, "-") + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast("已导出备份文件");
}
function applyProfileObject(obj) {
  const data = (obj && typeof obj.data === "object" && obj.data) ? obj.data : (obj && typeof obj === "object" ? obj : null);
  if (!data) throw new Error("文件内容不是有效的备份");
  let n = 0;
  for (const k in data) {
    if (k.indexOf(PROFILE_PREFIX) === 0 && typeof data[k] === "string") { localStorage.setItem(k, data[k]); n++; }
  }
  return n;
}

/* ============ 收藏 ============ */
function findMessageFav(sessionId, messageId) {
  return S.favorites.find(f => f.kind === "message" && f.sessionId === sessionId && f.messageId === messageId) || null;
}
function findSessionFav(sessionId) {
  return S.favorites.find(f => f.kind === "session" && f.sessionId === sessionId) || null;
}
function removeFavoriteById(favId) {
  S.favorites = S.favorites.filter(f => f.id !== favId);
  saveStore();
}
function assistantDisplayName(id) {
  const a = S.assistants.find(x => x.id === id);
  return a ? (a.name || "未命名") : "已删除的助手";
}
function fmtFavTime(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return ""; }
}
function setFavBtn(btn, on) {
  btn.innerHTML = "";
  btn.appendChild(iconEl(on ? "starFill" : "star"));
  btn.appendChild(document.createTextNode(on ? "已收藏" : "收藏"));
  btn.classList.toggle("fav-on", on);
}
function toggleMessageFavorite(wrap, btn) {
  if (!currentSession) return;
  const id = wrap.dataset.id;
  const text = messageRawText(wrap);
  const existing = findMessageFav(currentSession.id, id);
  if (existing) {
    removeFavoriteById(existing.id);
    setFavBtn(btn, false);
    showToast("已取消收藏");
    return;
  }
  S.favorites.push({
    id: uid("fav"), kind: "message", assistantId: S.activeId,
    sessionId: currentSession.id, messageId: id, role: wrap.dataset.role,
    text: text, savedAt: Date.now(), updatedAt: Date.now(),
  });
  saveStore();
  setFavBtn(btn, true);
  showToast("已收藏此消息");
}
function toggleSessionFavorite(s) {
  const existing = findSessionFav(s.id);
  if (existing) removeFavoriteById(existing.id);
  else S.favorites.push({
    id: uid("fav"), kind: "session", assistantId: S.activeId,
    sessionId: s.id, directory: activeDir, title: s.title || s.id,
    savedAt: Date.now(), updatedAt: Date.now(),
  });
  saveStore();
  refreshSessionList();
}

