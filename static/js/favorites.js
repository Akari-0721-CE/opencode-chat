/* ============ 收藏夹 ============ */
function openFavorites() {
  renderFavorites();
  $("favMask").classList.add("show");
}
function closeFavorites() {
  $("favMask").classList.remove("show");
}
function favItem(main, buttons) {
  const item = el("div", "fav-item");
  item.appendChild(main);
  const act = el("div", "fav-actions");
  (buttons || []).forEach(b => act.appendChild(b));
  item.appendChild(act);
  return item;
}
function favAction(label, fn, danger) {
  const b = el("button", danger ? "danger" : "", label);
  b.onclick = fn;
  return b;
}
function favSnippet(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 60) + "…" : (t || "（空）");
}
function renderFavorites() {
  const box = $("favList");
  box.innerHTML = "";
  const assistants = S.assistants.filter(a => a.favorite);
  const sessions = S.favorites.filter(f => f.kind === "session").sort((a, b) => b.savedAt - a.savedAt);
  const messages = S.favorites.filter(f => f.kind === "message").sort((a, b) => b.savedAt - a.savedAt);

  box.appendChild(el("div", "fav-section-title", "收藏的助手（" + assistants.length + "）"));
  if (!assistants.length) box.appendChild(el("div", "fav-empty", "暂无"));
  for (const a of assistants) {
    const main = el("div", "fav-main");
    main.appendChild(el("div", "fav-title", (a.icon ? a.icon + " " : "") + (a.name || "未命名")));
    main.appendChild(el("div", "fav-sub", a.directory || ""));
    main.onclick = () => openFavoriteAssistant(a);
    box.appendChild(favItem(main, [
      favAction("打开", () => openFavoriteAssistant(a)),
      favAction("取消收藏", () => { a.favorite = false; saveStore(); renderTree(); renderFavorites(); }),
    ]));
  }

  box.appendChild(el("div", "fav-section-title", "收藏的对话（" + sessions.length + "）"));
  if (!sessions.length) box.appendChild(el("div", "fav-empty", "暂无"));
  for (const f of sessions) {
    const main = el("div", "fav-main");
    main.appendChild(el("div", "fav-title", f.title || f.sessionId));
    main.appendChild(el("div", "fav-sub", assistantDisplayName(f.assistantId) + " · " + fmtFavTime(f.savedAt)));
    main.onclick = () => openFavoriteSession(f);
    box.appendChild(favItem(main, [
      favAction("打开", () => openFavoriteSession(f)),
      favAction("编辑", () => editFavoriteSession(f)),
      favAction("删除", () => { removeFavoriteById(f.id); renderFavorites(); }, true),
    ]));
  }

  box.appendChild(el("div", "fav-section-title", "收藏的消息（" + messages.length + "）"));
  if (!messages.length) box.appendChild(el("div", "fav-empty", "暂无"));
  for (const f of messages) {
    const main = el("div", "fav-main");
    main.appendChild(el("div", "fav-title", (f.role === "user" ? "你" : "assistant") + "：" + favSnippet(f.text)));
    main.appendChild(el("div", "fav-sub", assistantDisplayName(f.assistantId) + " · " + fmtFavTime(f.savedAt)));
    main.onclick = () => openFavoriteMessage(f);
    box.appendChild(favItem(main, [
      favAction("查看", () => openFavoriteMessage(f)),
      favAction("编辑", () => editFavoriteMessage(f)),
      favAction("删除", () => { removeFavoriteById(f.id); renderFavorites(); }, true),
    ]));
  }
}
function openFavoriteAssistant(a) {
  closeFavorites();
  activateAssistant(a.id, { restore: true });
}
async function openFavoriteSession(f) {
  const a = S.assistants.find(x => x.id === f.assistantId);
  if (!a) { showToast("原助手已删除，无法打开", true); return; }
  closeFavorites();
  await activateAssistant(f.assistantId, { sessionId: f.sessionId });
}
async function openFavoriteMessage(f) {
  const a = S.assistants.find(x => x.id === f.assistantId);
  if (!a) { showToast("原助手已删除，无法定位", true); return; }
  closeFavorites();
  pendingScrollMessageId = f.messageId;
  await activateAssistant(f.assistantId, { sessionId: f.sessionId });
}
function editFavoriteSession(f) {
  openPrompt("编辑收藏标题", f.title || "", (v) => {
    f.title = v.trim() || f.title;
    f.updatedAt = Date.now();
    saveStore();
    renderFavorites();
  });
}
function editFavoriteMessage(f) {
  openEditor("编辑收藏内容", f.text || "", (v) => {
    f.text = v;
    f.updatedAt = Date.now();
    saveStore();
    renderFavorites();
  });
}
let editorOkFn = null;
function openEditor(title, value, onOk) {
  $("editorTitle").textContent = title;
  $("editorText").value = value || "";
  editorOkFn = onOk || null;
  $("editorMask").classList.add("show");
  setTimeout(() => $("editorText").focus(), 30);
}
$("editorOk").onclick = () => {
  const fn = editorOkFn; editorOkFn = null;
  $("editorMask").classList.remove("show");
  if (fn) fn($("editorText").value);
};
$("editorCancel").onclick = () => { editorOkFn = null; $("editorMask").classList.remove("show"); };
$("editorMask").addEventListener("click", (e) => {
  if (e.target === $("editorMask")) { editorOkFn = null; $("editorMask").classList.remove("show"); }
});
$("favBtn").onclick = openFavorites;
$("favClose").onclick = closeFavorites;
$("favMask").addEventListener("click", (e) => { if (e.target === $("favMask")) closeFavorites(); });

/* ============ 消息搜索 ============ */
let searchMatches = [];
let searchActive = -1;

function collectSearchItems() {
  const out = [];
  messagesEl.querySelectorAll(".msg").forEach((wrap) => {
    const id = wrap.dataset.id;
    const role = wrap.dataset.role;
    if (!id || !role) return;
    const text = messageRawText(wrap);
    if (text) out.push({ id, role, text });
  });
  return out;
}

function searchSnippet(text, terms) {
  const lower = text.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  const start = idx < 0 ? 0 : Math.max(0, idx - 40);
  let snip = text.slice(start, start + 180);
  if (start > 0) snip = "…" + snip;
  if (start + 180 < text.length) snip += "…";
  let html = escapeHtml(snip);
  const pat = terms.map((t) => escapeRe(escapeHtml(t))).join("|");
  if (pat) html = html.replace(new RegExp(pat, "gi"), (m) => "<mark>" + m + "</mark>");
  return html;
}
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runSearch(q) {
  const box = $("searchResults");
  const hint = $("searchHint");
  searchMatches = [];
  searchActive = -1;
  box.innerHTML = "";
  const query = String(q || "").trim();
  if (!query) {
    hint.textContent = "输入关键词搜索当前会话（空格分隔多个关键词，需全部命中）";
    return;
  }
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const all = collectSearchItems();
  searchMatches = all.filter((it) => {
    const l = it.text.toLowerCase();
    return terms.every((t) => l.includes(t));
  });
  hint.textContent = searchMatches.length + " 条匹配 · 共 " + all.length + " 条消息";
  if (!searchMatches.length) {
    box.appendChild(el("div", "search-empty", "没有匹配的消息"));
    return;
  }
  searchMatches.forEach((m, i) => {
    const item = el("div", "search-item");
    item.appendChild(el("div", "search-role", m.role === "user" ? "你" : "assistant"));
    const sn = el("div", "search-snippet");
    sn.innerHTML = searchSnippet(m.text, terms);
    item.appendChild(sn);
    item.onclick = () => jumpToSearchResult(i);
    box.appendChild(item);
  });
}

function setActiveSearchResult(i) {
  const items = $("searchResults").querySelectorAll(".search-item");
  if (!items.length) return;
  searchActive = Math.max(0, Math.min(items.length - 1, i));
  items.forEach((it, k) => it.classList.toggle("active", k === searchActive));
  items[searchActive].scrollIntoView({ block: "nearest" });
}

function jumpToSearchResult(i) {
  const m = searchMatches[i];
  if (!m) return;
  const entry = msgEls[m.id];
  closeSearch();
  if (entry && entry.el) {
    entry.el.scrollIntoView({ block: "center" });
    entry.el.classList.add("search-flash");
    setTimeout(() => entry.el.classList.remove("search-flash"), 1600);
  } else {
    showToast("原消息已不存在", true);
  }
}

function openSearch() {
  if (!currentSession) { showToast("请先选择一个会话", true); return; }
  $("searchInput").value = "";
  runSearch("");
  $("searchMask").classList.add("show");
  setTimeout(() => $("searchInput").focus(), 30);
}
function closeSearch() { $("searchMask").classList.remove("show"); }

$("searchBtn").onclick = openSearch;
$("searchClose").onclick = closeSearch;
$("searchMask").addEventListener("click", (e) => { if (e.target === $("searchMask")) closeSearch(); });
$("searchInput").addEventListener("input", () => runSearch($("searchInput").value));
$("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); setActiveSearchResult(searchActive + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setActiveSearchResult(searchActive - 1); }
  else if (e.key === "Enter") { e.preventDefault(); jumpToSearchResult(searchActive >= 0 ? searchActive : 0); }
  else if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "f" || e.key === "F")) {
    e.preventDefault();
    openSearch();
  }
});

