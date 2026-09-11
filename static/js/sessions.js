/* ============ 激活助手 / 会话 ============ */
function resetMain() {
  if (typeof stopProxyAuto === "function") stopProxyAuto();
  if (typeof clearHostingNote === "function") clearHostingNote();
  activeDir = null;
  currentSession = null;
  sessionsCache = [];
  messagesEl.innerHTML = "";
  msgEls = {}; partEls = {};
  renderSessions([]);
  refreshAssistantChrome();
  showPlaceholder("还没有助手，先新建一个吧");
  clearAttachments();
  closeEvents();
  input.disabled = true; sendBtn.disabled = true; stopBtn.disabled = true; attachBtn.disabled = true;
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
  msgEls = {}; partEls = {};
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
    sessionsCache = (Array.isArray(list) ? list : []).filter(s => normDir(s.directory) === target);
  } catch (e) {
    console.error(e);
    sessionsCache = [];
    renderSessions([], "无法加载该工作区的会话：" + e.message);
    return;
  }
  renderSessions(sessionsCache);
}

function renderSessions(list, hintText) {
  sessionList.innerHTML = "";
  if (!list.length) {
    sessionList.appendChild(el("li", "hint", hintText || "暂无会话"));
    return;
  }
  for (const s of list) {
    const li = el("li", s.id === (currentSession && currentSession.id) ? "active" : "");
    const label = el("span", "s-label", s.title || s.id);
    li.appendChild(label);
    if (s.id === (currentSession && currentSession.id)) li.appendChild(el("span", "live-dot" + (busy ? " busy" : "")));
    li.title = s.title || s.id;

    const actions = el("div", "row-actions");
    const isFav = !!findSessionFav(s.id);
    const bFav = el("button", "mini-btn" + (isFav ? " fav-on" : ""));
    bFav.title = isFav ? "取消收藏" : "收藏此对话";
    bFav.appendChild(iconEl(isFav ? "starFill" : "star"));
    bFav.onclick = (e) => { e.stopPropagation(); toggleSessionFavorite(s); };
    const bEdit = el("button", "mini-btn"); bEdit.title = "重命名"; bEdit.appendChild(iconEl("pencil"));
    bEdit.onclick = (e) => { e.stopPropagation(); renameSession(s); };
    const bDel = el("button", "mini-btn"); bDel.title = "删除"; bDel.appendChild(iconEl("trash"));
    bDel.onclick = (e) => { e.stopPropagation(); deleteSession(s); };
    actions.append(bFav, bEdit, bDel);
    li.appendChild(actions);

    li.onclick = () => selectSession(s.id);
    sessionList.appendChild(li);
  }
}

async function selectSession(id) {
  if (typeof stopProxyAuto === "function") stopProxyAuto();
  if (typeof clearHostingNote === "function") clearHostingNote();
  if (currentSession && currentSession.id !== id) saveDraft(currentSession.id, input.value);
  currentSession = { id, directory: activeDir };
  S.last[S.activeId] = id;
  saveStore();
  renderSessions(sessionsCache);
  messagesEl.innerHTML = "";
  msgEls = {}; partEls = {};
  refreshSessionTokens();
  clearAttachments();
  input.disabled = false;
  attachBtn.disabled = false;
  sendBtn.disabled = busy;
  input.value = loadDraft(id);
  updateSendState();
  if (typeof updateProxyUI === "function") updateProxyUI();
  try {
    const msgs = await api("/session/" + id + "/message", { directory: activeDir });
    for (const m of msgs) renderMessage(m.info, m.parts);
    markLastAssistant();
    scrollBottom(true);
    if (!msgs.length) showPlaceholder("输入消息开始对话");
    if (pendingScrollMessageId) {
      const targetId = pendingScrollMessageId;
      pendingScrollMessageId = null;
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
    alert("新建会话失败：" + e.message);
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
      renderSessions(sessionsCache);
      if (currentSession && currentSession.id === s.id) refreshAssistantChrome();
    } catch (e) {
      alert("重命名失败：" + e.message);
    }
  });
}

async function deleteSession(s) {
  if (!confirm('删除会话「' + (s.title || s.id) + '」？此操作不可恢复。')) return;
  try {
    await api("/session/" + s.id, { method: "DELETE", directory: activeDir });
    dropDraft(s.id);
    sessionsCache = sessionsCache.filter(x => x.id !== s.id);
    if (currentSession && currentSession.id === s.id) {
      currentSession = null;
      messagesEl.innerHTML = "";
      input.disabled = true; sendBtn.disabled = true;
      if (S.last[S.activeId] === s.id) delete S.last[S.activeId];
      if (sessionsCache.length) selectSession(sessionsCache[0].id);
      else showPlaceholder("该助手还没有会话，点击「新会话」开始");
    }
    renderSessions(sessionsCache);
    saveStore();
  } catch (e) {
    alert("删除失败：" + e.message);
  }
}

