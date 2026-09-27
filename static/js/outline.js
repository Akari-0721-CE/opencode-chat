/* ============ 会话导航（缩略图 / 大纲） ============ */
/* 把整段对话压缩成一列「简短聊天记录」：长文本收成一句、工具调用标注，
   点击任意条目即可跳转定位到对应消息。 */

function outlineSnippet(text, max) {
  const limit = (typeof max === "number" && max > 0) ? max : 64;
  const s = String(text === null || text === undefined ? "" : text).replace(/\s+/g, " ").trim();
  if (s.length <= limit) return s;
  return s.slice(0, limit) + "…";
}

function outlineItems(msgs) {
  const out = [];
  const list = Array.isArray(msgs) ? msgs : ((typeof sessionMessages !== "undefined" && Array.isArray(sessionMessages)) ? sessionMessages : []);
  for (const m of list) {
    const info = m && m.info;
    if (!info) continue;
    let text = "";
    const tools = [];
    for (const p of (m.parts || [])) {
      if (!p) continue;
      if (p.type === "text" && !p.synthetic && p.text) {
        text += (text ? "\n\n" : "") + p.text;
      } else if (p.type === "tool" && p.tool) {
        if (tools.indexOf(p.tool) < 0) tools.push(p.tool);
      } else if (p.type === "file") {
        if (tools.indexOf("file") < 0) tools.push("file");
      }
    }
    if (info.role === "user" && typeof splitSendStamp === "function") text = splitSendStamp(text).body;
    out.push({
      id: info.id,
      role: info.role === "user" ? "user" : "assistant",
      text: outlineSnippet(text),
      tools,
    });
  }
  return out;
}

function toolLabel(id) {
  if (id === "file") return typeof t === "function" ? t("文件") : "文件";
  if (typeof toolInfo === "function") return toolInfo(id).name;
  return id;
}

function renderOutline() {
  const box = $("outlineList");
  if (!box) return;
  box.innerHTML = "";
  const items = outlineItems();
  const count = $("outlineCount");
  if (count) count.textContent = items.length ? (typeof tf === "function" ? tf("{0} 条", items.length) : items.length + " 条") : "";
  if (!items.length) {
    box.appendChild(el("div", "outline-empty", typeof t === "function" ? t("暂无消息") : "暂无消息"));
    return;
  }
  items.forEach((it, i) => {
    const row = el("div", "outline-item " + (it.role === "user" ? "ou-user" : "ou-assistant"));
    row.dataset.id = it.id;
    row.appendChild(el("span", "ou-idx", String(i + 1)));
    row.appendChild(el("span", "ou-role", typeof t === "function" ? t(it.role === "user" ? "你" : "助手") : (it.role === "user" ? "你" : "助手")));
    if (it.tools.length) {
      row.appendChild(el("span", "ou-tool", it.tools.slice(0, 3).map(toolLabel).join(" / ")));
    }
    row.appendChild(el("span", "ou-snip", it.text || (it.tools.length ? (typeof t === "function" ? t("（工具调用）") : "（工具调用）") : (typeof t === "function" ? t("（空）") : "（空）"))));
    row.onclick = () => jumpToOutline(it.id);
    box.appendChild(row);
  });
  highlightOutlineCurrent();
}

/* 高亮当前视野所在的消息，便于快速判断“读到哪了”。 */
function highlightOutlineCurrent() {
  const box = $("outlineList");
  if (!box || !box.querySelectorAll || typeof msgEls === "undefined") return;
  const rows = box.querySelectorAll(".outline-item");
  if (!rows.length) return;
  let best = null;
  rows.forEach((row) => {
    const entry = msgEls[row.dataset.id];
    if (!entry || !entry.el || typeof entry.el.getBoundingClientRect !== "function") return;
    try {
      if (entry.el.getBoundingClientRect().top <= 8) best = row;
    } catch (e) { /* ignore */ }
  });
  if (!best) best = rows[0];
  rows.forEach((r) => r.classList.toggle("active", r === best));
  if (best.scrollIntoView) { try { best.scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ } }
}

function jumpToOutline(id) {
  closeOutline();
  let entry = msgEls[id];
  if (!entry && typeof ensureHistoryMessageRendered === "function") {
    ensureHistoryMessageRendered(id);
    entry = msgEls[id];
  }
  if (entry && entry.el) {
    if (typeof autoScroll !== "undefined") autoScroll = false;
    entry.el.scrollIntoView({ block: "center" });
    entry.el.classList.add("search-flash");
    setTimeout(() => { try { entry.el.classList.remove("search-flash"); } catch (e) { /* ignore */ } }, 1600);
  } else if (typeof showToast === "function") {
    showToast("原消息已不存在", true);
  }
}

function openOutline() {
  if (!currentSession) { if (typeof showToast === "function") showToast("请先选择一个会话", true); return; }
  if (!sessionMessages || !sessionMessages.length) { if (typeof showToast === "function") showToast("当前会话还没有消息", true); return; }
  const mask = $("outlineMask");
  if (mask) mask.classList.add("show");
  renderOutline();
}

function closeOutline() {
  const mask = $("outlineMask");
  if (mask) mask.classList.remove("show");
}

(function initOutline() {
  const open = $("outlineBtn");
  if (open) open.onclick = openOutline;
  const close = $("outlineClose");
  if (close) close.onclick = closeOutline;
  const mask = $("outlineMask");
  if (mask) mask.addEventListener("click", (e) => { if (e.target === mask) closeOutline(); });
})();
