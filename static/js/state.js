/* ============ API ============ */
let activeDir = null;

async function api(path, opts = {}) {
  const { directory, noDir, headers, ...init } = opts || {};
  const dir = directory !== undefined ? directory : activeDir;
  const h = Object.assign({}, headers);
  if (window.__OC_TOKEN) h["X-OC-Token"] = window.__OC_TOKEN;
  if (Object.keys(h).length) init.headers = h;
  let url = "/api" + path;
  if (dir && !noDir) url += (url.includes("?") ? "&" : "?") + "directory=" + encodeURIComponent(dir);
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 500); } catch (e) { /* ignore */ }
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
const S = { folders: [], assistants: [], activeId: null, last: {}, favorites: [] };
let defaultModel = null;
try { defaultModel = JSON.parse(localStorage.getItem("oc_model") || "null"); } catch (e) { defaultModel = null; }

let currentSession = null;
let sessionsCache = [];
let busy = false;
let eventSource = null;
let eventsDir = null;
let msgEls = {};
let partEls = {};
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

function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(S));
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
    }
  } catch (e) { /* ignore */ }
}
function activeAssistant() {
  return S.assistants.find(a => a.id === S.activeId) || null;
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
  renderSessions(sessionsCache);
}

