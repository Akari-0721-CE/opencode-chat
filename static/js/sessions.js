/* ============ 会话列表：时间 / 分组 / 跨助手搜索 / 最近删除 ============ */
let sessionQuery = "";
let allSessionsCache = null;
let allSessionsAt = 0;
let sessionSearchTimer = null;
const TRASH_MAX = 100;
const LOW_PERF_RENDER_LIMIT = 40;
let loadEarlierEl = null;

/* ---------- 纯函数（可单测） ---------- */
function sessionUpdated(s) {
  return (s && s.time && (s.time.updated || s.time.created)) || 0;
}
function sessionDayStart(ms) {
  const d = new Date(ms || 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function sessionDayLabel(ms, now) {
  const n = now == null ? Date.now() : now;
  const diff = Math.round((sessionDayStart(n) - sessionDayStart(ms)) / 86400000);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  const d = new Date(ms);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function fmtSessionTime(ms, now) {
  if (!ms) return "";
  const n = now == null ? Date.now() : now;
  const d = new Date(ms);
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const diff = Math.round((sessionDayStart(n) - sessionDayStart(ms)) / 86400000);
  if (diff <= 0) return hm;
  if (diff === 1) return "昨天";
  const md = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  if (d.getFullYear() === new Date(n).getFullYear()) return md;
  return d.getFullYear() + "-" + md;
}
function groupSessionsByDay(list, now) {
  const groups = [];
  const index = new Map();
  for (const s of (list || [])) {
    const ms = sessionUpdated(s);
    const key = String(sessionDayStart(ms));
    let g = index.get(key);
    if (!g) { g = { key: key, label: sessionDayLabel(ms, now), items: [] }; index.set(key, g); groups.push(g); }
    g.items.push(s);
  }
  return groups;
}
function filterSessions(list, query, nameOf) {
  const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return (list || []).slice();
  return (list || []).filter((s) => {
    const owner = nameOf ? (nameOf(s) || "") : "";
    const hay = ((s.title || "") + " " + (s.directory || "") + " " + owner + " " + (s.id || "")).toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/* ---------- 渲染 ---------- */
function sessionOwnerName(s) {
  const a = assistantForDir(s && s.directory);
  if (a) return a.name || (typeof t === "function" ? t("未命名") : "未命名");
  return typeof t === "function" ? t("未归属") : "未归属";
}
function sessionRow(s, opts) {
  opts = opts || {};
  const active = currentSession && s.id === currentSession.id;
  const li = el("li", active ? "active" : "");
  const label = el("span", "s-label", s.title || s.id);
  li.appendChild(label);
  if (opts.owner) li.appendChild(el("span", "s-badge", opts.owner));
  if (active) li.appendChild(el("span", "live-dot" + (busy ? " busy" : "")));
  const timeText = fmtSessionTime(sessionUpdated(s), opts.now);
  li.appendChild(el("span", "s-time", (typeof t === "function" ? t(timeText) : timeText)));
  const titleBits = [s.title || s.id];
  if (opts.owner) titleBits.push(opts.owner);
  if (timeText) titleBits.push(timeText);
  li.title = titleBits.join(" · ");

  const actions = el("div", "row-actions");
  const isFav = !!findSessionFav(s.id);
  const bFav = el("button", "mini-btn" + (isFav ? " fav-on" : ""));
  bFav.title = isFav ? "取消收藏" : "收藏此对话";
  bFav.appendChild(iconEl(isFav ? "starFill" : "star"));
  bFav.onclick = (e) => { e.stopPropagation(); toggleSessionFavorite(s); };
  const bEdit = el("button", "mini-btn"); bEdit.title = "重命名"; bEdit.appendChild(iconEl("pencil"));
  bEdit.onclick = (e) => { e.stopPropagation(); renameSession(s); };
  const bDel = el("button", "mini-btn"); bDel.title = "删除（可在最近删除恢复）"; bDel.appendChild(iconEl("trash"));
  bDel.onclick = (e) => { e.stopPropagation(); deleteSession(s); };
  actions.append(bFav, bEdit, bDel);
  li.appendChild(actions);
  syncAriaLabels(actions);

  li.onclick = opts.hit ? () => openSessionHit(s) : () => selectSession(s.id);
  makeRowInteractive(li);
  return li;
}
function renderSessions(list, hintText, opts) {
  opts = opts || {};
  sessionList.innerHTML = "";
  if (!list || !list.length) {
    sessionList.appendChild(el("li", "hint", hintText || (typeof t === "function" ? t("暂无会话") : "暂无会话")));
    return;
  }
  const now = opts.now == null ? Date.now() : opts.now;
  if (opts.flat) {
    for (const s of list) sessionList.appendChild(sessionRow(s, { owner: sessionOwnerName(s), now: now, hit: true }));
    return;
  }
  for (const g of groupSessionsByDay(list, now)) {
    const head = el("li", "s-day", (typeof t === "function" ? t(g.label) : g.label));
    head.setAttribute("aria-hidden", "true");
    sessionList.appendChild(head);
    for (const s of g.items) sessionList.appendChild(sessionRow(s, { now: now }));
  }
}
function refreshSessionList() {
  if (sessionQuery.trim()) renderSessionSearch();
  else renderSessions(sessionsCache);
}

/* ---------- 跨助手搜索 ---------- */
async function ensureAllSessions(force) {
  const now = Date.now();
  if (!force && allSessionsCache && now - allSessionsAt < 15000) return allSessionsCache;
  const list = await api("/session", { noDir: true });
  allSessionsCache = (Array.isArray(list) ? list : []).filter(s => !(s.time && s.time.archived));
  allSessionsAt = now;
  return allSessionsCache;
}
function renderSessionSearch() {
  const q = sessionQuery.trim();
  if (!q) { renderSessions(sessionsCache); return; }
  if (!allSessionsCache) { renderSessions([], "搜索中…"); return; }
  const pool = allSessionsCache.filter(s => !isTrashed(s.id));
  const hits = filterSessions(pool, q, sessionOwnerName).sort((a, b) => sessionUpdated(b) - sessionUpdated(a));
  if (hits.length) renderSessions(hits.slice(0, 200), "", { flat: true });
  else renderSessions([], "没有匹配的会话");
}
function onSessionSearchInput() {
  sessionQuery = $("sessionSearch").value;
  clearTimeout(sessionSearchTimer);
  if (!sessionQuery.trim()) { renderSessions(sessionsCache); return; }
  if (allSessionsCache) renderSessionSearch();
  else renderSessions([], "搜索中…");
  sessionSearchTimer = setTimeout(() => {
    ensureAllSessions()
      .then(() => { if (sessionQuery.trim()) renderSessionSearch(); })
      .catch((e) => { if (sessionQuery.trim()) renderSessions([], "搜索失败：" + e.message); });
  }, 180);
}
async function openSessionHit(s) {
  const a = assistantForDir(s && s.directory);
  if (!a) { showToast("找不到该会话对应的助手（目录：" + ((s && s.directory) || "?") + "）", true); return; }
  $("sessionSearch").value = "";
  sessionQuery = "";
  await activateAssistant(a.id, { sessionId: s.id });
}
$("sessionSearch").addEventListener("input", onSessionSearchInput);
$("sessionSearch").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.stopPropagation();
    $("sessionSearch").value = "";
    sessionQuery = "";
    renderSessions(sessionsCache);
  }
});

/* ---------- 最近删除（删除后恢复） ---------- */
function trashEntryFor(id) {
  return (Array.isArray(S.trash) ? S.trash : []).find(t => t.id === id) || null;
}
function trashSession(s) {
  if (!Array.isArray(S.trash)) S.trash = [];
  S.trash = S.trash.filter(t => t.id !== s.id);
  S.trash.unshift({
    id: s.id, title: s.title || s.id, directory: s.directory || activeDir,
    assistantId: S.activeId, deletedAt: Date.now(),
  });
  while (S.trash.length > TRASH_MAX) S.trash.pop();
  dropDraft(s.id);
  sessionsCache = sessionsCache.filter(x => x.id !== s.id);
  if (allSessionsCache) allSessionsCache = allSessionsCache.filter(x => x.id !== s.id);
  if (currentSession && currentSession.id === s.id) {
    currentSession = null;
    messagesEl.innerHTML = "";
    input.disabled = true; sendBtn.disabled = true;
    if (S.last[S.activeId] === s.id) delete S.last[S.activeId];
    if (sessionsCache.length) selectSession(sessionsCache[0].id);
    else showPlaceholder("该助手还没有会话，点击「新会话」开始");
  }
  saveStore();
  refreshSessionList();
  const entry = trashEntryFor(s.id);
  showToast("已删除，可在「最近删除」恢复", false, { label: "撤销", onClick: () => restoreSession(entry) });
}
async function deleteSession(s) {
  const ok = await confirmDialog({ title: "删除会话", text: '删除会话「' + (s.title || s.id) + '」？可在「最近删除」中恢复。', okText: "删除", danger: true });
  if (!ok) return;
  trashSession(s);
}
async function restoreSession(entry) {
  if (!entry) return;
  const a = S.assistants.find(x => x.id === entry.assistantId) || assistantForDir(entry.directory);
  S.trash = (Array.isArray(S.trash) ? S.trash : []).filter(t => t.id !== entry.id);
  saveStore();
  if (!a) { showToast("原助手已删除，无法恢复该会话", true); renderTrash(); return; }
  closeTrash();
  await activateAssistant(a.id, { sessionId: entry.id });
  showToast("已恢复会话「" + (entry.title || entry.id) + "」");
}
async function purgeSession(entry) {
  const ok = await confirmDialog({ title: "彻底删除", text: '彻底删除会话「' + (entry.title || entry.id) + '」？此操作不可恢复。', okText: "彻底删除", danger: true });
  if (!ok) return;
  try {
    await api("/session/" + entry.id, { method: "DELETE", directory: entry.directory || activeDir });
  } catch (e) {
    showToast("删除失败：" + e.message, true);
    return;
  }
  S.trash = (Array.isArray(S.trash) ? S.trash : []).filter(t => t.id !== entry.id);
  saveStore();
  renderTrash();
  showToast("已彻底删除");
}
async function emptyTrash() {
  const list = (Array.isArray(S.trash) ? S.trash : []).slice();
  if (!list.length) { showToast("回收站已是空的"); return; }
  const ok = await confirmDialog({ title: "清空回收站", text: "彻底删除回收站中的 " + list.length + " 个会话？此操作不可恢复。", okText: "清空", danger: true });
  if (!ok) return;
  let failed = 0;
  for (const t of list) {
    try { await api("/session/" + t.id, { method: "DELETE", directory: t.directory || activeDir }); }
    catch (e) { failed++; }
  }
  S.trash = [];
  saveStore();
  renderTrash();
  showToast(failed ? ("已清空，" + failed + " 个删除失败") : ("已清空回收站（" + list.length + " 个会话）"), !!failed);
}
function renderTrash() {
  const box = $("trashList");
  if (!box) return;
  box.innerHTML = "";
  const list = (Array.isArray(S.trash) ? S.trash : []).slice().sort((a, b) => b.deletedAt - a.deletedAt);
  if ($("trashEmpty")) $("trashEmpty").style.display = list.length ? "" : "none";
  if (!list.length) { box.appendChild(el("div", "fav-empty", "暂无删除的会话")); return; }
  for (const t of list) {
    const main = el("div", "fav-main");
    main.appendChild(el("div", "fav-title", t.title || t.id));
    const a = S.assistants.find(x => x.id === t.assistantId);
    const owner = a ? (a.name || "未命名") : assistantDisplayName(t.assistantId);
    main.appendChild(el("div", "fav-sub", owner + " · " + fmtFavTime(t.deletedAt)));
    box.appendChild(favItem(main, [
      favAction("恢复", () => restoreSession(t)),
      favAction("彻底删除", () => purgeSession(t), true),
    ]));
  }
}
function openTrash() { renderTrash(); $("trashMask").classList.add("show"); }
function closeTrash() { $("trashMask").classList.remove("show"); }
$("trashOpen").appendChild(iconEl("trash"));
$("trashOpen").onclick = openTrash;
$("trashClose").onclick = closeTrash;
$("trashEmpty").onclick = emptyTrash;
$("trashMask").addEventListener("click", (e) => { if (e.target === $("trashMask")) closeTrash(); });

/* ============ 激活助手 / 会话 ============ */
function resetMain() {
  if (typeof stopProxyAuto === "function") stopProxyAuto();
  if (typeof clearHostingNote === "function") clearHostingNote();
  activeDir = null;
  currentSession = null;
  sessionsCache = [];
  allSessionsCache = null;
  sessionQuery = "";
  if ($("sessionSearch")) $("sessionSearch").value = "";
  messagesEl.innerHTML = "";
  msgEls = {}; partEls = {}; dirtyMsgIds = new Set();
  sessionMessages = []; sessionRenderStart = 0; loadEarlierEl = null;
  renderSessions([]);
  refreshAssistantChrome();
  showPlaceholder("还没有助手，先新建一个吧");
  clearAttachments();
  closeEvents();
  input.disabled = true; sendBtn.disabled = true; stopBtn.disabled = true; attachBtn.disabled = true;
  if ($("ocrBtn")) $("ocrBtn").disabled = true;
  if (typeof updateProxyUI === "function") updateProxyUI();
}

function refreshAssistantChrome() {
  const a = activeAssistant();
  const av = $("currentAvatar");
  if (a) {
    av.style.display = "";
    setAvatarContent(av, a.avatar, a.icon, a.name);
  } else {
    av.style.display = "none";
  }
  $("currentName").textContent = a ? (a.name || "未命名") : "—";
  $("currentPath").textContent = a ? (a.directory || "") : "";
  sessionsName.textContent = a ? (a.name || "未命名") : "会话";
  newSessionBtn.disabled = !a;
  updateModelSelect();
}

async function activateAssistant(id, opts = {}) {
  const a = S.assistants.find(x => x.id === id);
  if (!a) return;
  if (typeof stopProxyAuto === "function") stopProxyAuto();
  if (typeof clearHostingNote === "function") clearHostingNote();
  S.activeId = id;
  activeDir = a.directory;
  connectEvents();
  if (currentSession) saveDraft(currentSession.id, input.value);
  currentSession = null;
  msgEls = {}; partEls = {}; dirtyMsgIds = new Set();
  sessionMessages = []; sessionRenderStart = 0; loadEarlierEl = null;
  messagesEl.innerHTML = "";
  input.value = "";
  clearAttachments();
  input.disabled = true; sendBtn.disabled = true; stopBtn.disabled = true; attachBtn.disabled = true;
  busy = false;
  saveStore();
  renderTree();
  refreshAssistantChrome();
  showPlaceholder("加载中…");
  await loadSessions(a);
  const want = opts.sessionId || (opts.restore ? S.last[id] : null);
  if (want && sessionsCache.some(s => s.id === want)) {
    selectSession(want);
  } else if (sessionsCache.length) {
    selectSession(sessionsCache[0].id);
  } else {
    showPlaceholder("该助手还没有会话，点击「新会话」开始");
  }
}

async function loadSessions(a) {
  try {
    const list = await api("/session", { directory: a.directory });
    const target = normDir(a.directory);
    sessionsCache = (Array.isArray(list) ? list : [])
      .filter(s => normDir(s.directory) === target)
      .filter(s => !(s.time && s.time.archived))
      .filter(s => !isTrashed(s.id))
      .sort((x, y) => sessionUpdated(y) - sessionUpdated(x));
  } catch (e) {
    console.error(e);
    sessionsCache = [];
    renderSessions([], "无法加载该工作区的会话：" + e.message);
    return;
  }
  refreshSessionList();
}

function renderMessageHistory() {
  messagesEl.innerHTML = "";
  msgEls = {}; partEls = {}; dirtyMsgIds = new Set();
  loadEarlierEl = null;
  const msgs = sessionMessages || [];
  const limit = (typeof lowPerfEnabled === "function" && lowPerfEnabled()) ? LOW_PERF_RENDER_LIMIT : 0;
  const start = (limit && msgs.length > limit) ? msgs.length - limit : 0;
  sessionRenderStart = start;
  if (start > 0) addLoadEarlier(false);
  document.body.classList.add("bulk-render");
  try {
    for (let i = start; i < msgs.length; i++) {
      const m = msgs[i];
      if (m) renderMessage(m.info, m.parts);
    }
  } finally {
    document.body.classList.remove("bulk-render");
  }
  markLastAssistant();
  scrollBottom(true);
  if (!msgs.length) showPlaceholder("输入消息开始对话");
  return msgs.length;
}

function addLoadEarlier(loading) {
  if (loadEarlierEl) { updateLoadEarlierLabel(loading); return loadEarlierEl; }
  const wrap = el("div", "load-earlier");
  const b = el("button", "load-earlier-btn");
  b.type = "button";
  b.onclick = () => renderEarlierBatch();
  wrap.appendChild(b);
  messagesEl.appendChild(wrap);
  loadEarlierEl = wrap;
  updateLoadEarlierLabel(loading);
  return wrap;
}

function updateLoadEarlierLabel(loading) {
  if (!loadEarlierEl) return;
  const b = loadEarlierEl.querySelector(".load-earlier-btn");
  if (!b) return;
  if (loading) { b.textContent = "加载中…"; b.disabled = true; return; }
  b.disabled = false;
  b.textContent = sessionRenderStart > 0
    ? (typeof tf === "function" ? tf("加载更早消息（还有 {0} 条）", sessionRenderStart) : "加载更早消息（还有 " + sessionRenderStart + " 条）")
    : (typeof t === "function" ? t("已全部加载") : "已全部加载");
}

function renderEarlierBatch() {
  if (!sessionMessages || sessionRenderStart <= 0) return;
  if (loadEarlierEl) {
    const b = loadEarlierEl.querySelector(".load-earlier-btn");
    if (b) b.disabled = true;
  }
  const end = sessionRenderStart;
  const start = Math.max(0, end - LOW_PERF_RENDER_LIMIT);
  const frag = document.createDocumentFragment();
  renderMount = frag;
  document.body.classList.add("bulk-render");
  try {
    for (let i = start; i < end; i++) {
      const m = sessionMessages[i];
      if (m) renderMessage(m.info, m.parts);
    }
  } finally {
    renderMount = null;
    document.body.classList.remove("bulk-render");
  }
  messagesEl.insertBefore(frag, messagesEl.firstChild);
  sessionRenderStart = start;
  if (start <= 0) {
    if (loadEarlierEl && loadEarlierEl.remove) loadEarlierEl.remove();
    loadEarlierEl = null;
  } else {
    updateLoadEarlierLabel(false);
  }
  markLastAssistant();
}

function ensureHistoryMessageRendered(id) {
  let guard = 0;
  while (!msgEls[id] && sessionRenderStart > 0 && guard++ < 1000) renderEarlierBatch();
  return !!msgEls[id];
}

function rerenderCurrentMessages() {
  if (busy) return;
  if (!currentSession || !(sessionMessages && sessionMessages.length)) return;
  renderMessageHistory();
}

async function selectSession(id) {
  if (typeof stopProxyAuto === "function") stopProxyAuto();
  if (typeof clearHostingNote === "function") clearHostingNote();
  if (currentSession && currentSession.id !== id) saveDraft(currentSession.id, input.value);
  currentSession = { id, directory: activeDir };
  S.last[S.activeId] = id;
  saveStore();
  refreshSessionList();
  messagesEl.innerHTML = "";
  msgEls = {}; partEls = {}; dirtyMsgIds = new Set();
  sessionMessages = []; sessionRenderStart = 0; loadEarlierEl = null;
  refreshSessionTokens();
  clearAttachments();
  input.disabled = false;
  attachBtn.disabled = false;
  if ($("ocrBtn")) $("ocrBtn").disabled = false;
  sendBtn.disabled = busy;
  input.value = loadDraft(id);
  updateSendState();
  if (typeof updateProxyUI === "function") updateProxyUI();
  try {
    const msgs = await api("/session/" + id + "/message", { directory: activeDir });
    sessionMessages = Array.isArray(msgs) ? msgs : [];
    renderMessageHistory();
    if (pendingScrollMessageId) {
      const targetId = pendingScrollMessageId;
      pendingScrollMessageId = null;
      if (!msgEls[targetId] && sessionRenderStart > 0) ensureHistoryMessageRendered(targetId);
      const target = msgEls[targetId];
      if (target && target.el) {
        target.el.scrollIntoView({ block: "center" });
        target.el.classList.add("fav-flash");
        setTimeout(() => { if (target.el) target.el.classList.remove("fav-flash"); }, 1600);
      } else {
        showToast("原消息已不存在，已定位到会话", true);
      }
    }
  } catch (e) {
    console.error(e);
    showPlaceholder("加载消息失败：" + e.message);
  }
  syncPendingQuestions(id);
  checkSessionStatus();
}

async function syncPendingQuestions(sessionID) {
  try {
    const list = await api("/question", { directory: activeDir });
    for (const q of (Array.isArray(list) ? list : [])) {
      if (!sessionID || q.sessionID === sessionID) handleQuestion(q);
    }
  } catch (e) { /* ignore */ }
}

async function checkSessionStatus() {
  if (!currentSession) return;
  try {
    const all = await api("/session/status", { directory: activeDir });
    const st = all && all[currentSession.id];
    setBusy(!!(st && st.type === "busy"));
  } catch (e) { /* ignore */ }
}

async function newSession() {
  const a = activeAssistant();
  if (!a) return;
  try {
    const s = await api("/session", {
      method: "POST",
      directory: a.directory,
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await loadSessions(a);
    selectSession(s.id);
    input.focus();
  } catch (e) {
    showToast("新建会话失败：" + e.message, true);
  }
}
newSessionBtn.onclick = newSession;

function renameSession(s) {
  openPrompt("重命名会话", s.title || s.id, async (name) => {
    try {
      await api("/session/" + s.id, {
        method: "PATCH",
        directory: activeDir,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name }),
      });
      s.title = name;
      refreshSessionList();
      if (currentSession && currentSession.id === s.id) refreshAssistantChrome();
    } catch (e) {
      showToast("重命名失败：" + e.message, true);
    }
  });
}
