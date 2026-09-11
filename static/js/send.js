/* ============ 发送 / 停止 ============ */
function paramsMarker(a) {
  const o = {};
  if (a && typeof a.temperature === "number" && isFinite(a.temperature)) o.temperature = a.temperature;
  if (a && typeof a.topP === "number" && isFinite(a.topP)) o.topP = a.topP;
  if (a && a.variant === "none") o.reasoning = "none";
  o.bashTimeout = bashTimeoutMs();
  return PARAMS_MARK + JSON.stringify(o);
}

async function postPrompt(parts) {
  const a = activeAssistant();
  const body = { parts };
  if (a) {
    if (a.model) body.model = { providerID: a.model.providerID, modelID: a.model.id };
    if (a.agent) body.agent = a.agent;
    const vs = variantsOf(a.model || fallbackModel());
    if (a.variant === "none") {
      if (vs.includes("none")) body.variant = "none";
    } else if (a.variant && vs.includes(a.variant)) {
      body.variant = a.variant;
    }
    const marker = paramsMarker(a);
    if (a.pureInput) {
      body.parts = stampParts(parts);
      const sysParts = [];
      if (a.system && a.system.trim()) sysParts.push(a.system.trim());
      if (marker) sysParts.push(marker);
      body.system = BASE_OVERRIDE_MARK + (sysParts.length ? "\n" + sysParts.join("\n\n") : "");
    } else {
      const sysParts = [];
      if (a.system && a.system.trim()) sysParts.push(a.system.trim());
      if (a.gitSafe) sysParts.push(GIT_SAFE_RULE);
      if (marker) sysParts.push(marker);
      if (sysParts.length) body.system = (a.overrideBase ? BASE_OVERRIDE_MARK + "\n" : "") + sysParts.join("\n\n");
    }
    if (a.disabledTools && a.disabledTools.length) {
      body.tools = Object.fromEntries(a.disabledTools.map(id => [id, false]));
    }
  }
  await api("/session/" + currentSession.id + "/prompt_async", {
    method: "POST",
    directory: activeDir,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function send() {
  if (typeof rpProxyRunning !== "undefined" && rpProxyRunning) return;
  const text = input.value.trim();
  if ((!text && !attachments.length) || !currentSession || busy) return;
  for (const at of attachments) {
    if (!modelSupports(at.kind)) { showToast(unsupportedMsg(at.kind), true); return; }
  }
  const parts = attachments.map(at => ({ type: "file", mime: at.mime, filename: at.name, url: at.dataUrl }));
  if (text) parts.push({ type: "text", text });
  input.value = "";
  if (currentSession) saveDraft(currentSession.id, "");
  clearAttachments();
  autoScroll = true;
  try {
    await postPrompt(parts);
  } catch (e) {
    console.error(e);
    appendNotice("发送失败：" + e.message, true);
  }
}

async function regenerate(assistantId) {
  if (!currentSession || busy) return;
  if (typeof rpProxyRunning !== "undefined" && rpProxyRunning) { showToast("托管进行中，请稍候", true); return; }
  const sid = currentSession.id;
  let msgs;
  try {
    msgs = await api("/session/" + sid + "/message", { directory: activeDir });
  } catch (e) {
    appendNotice("重新生成失败：" + e.message, true);
    return;
  }
  const idx = msgs.findIndex(m => m.info.id === assistantId);
  if (idx < 0) { appendNotice("找不到该消息，请刷新会话", true); return; }
  let userMsg = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (msgs[i].info.role === "user") { userMsg = msgs[i]; break; }
  }
  if (!userMsg) { appendNotice("找不到对应的用户消息", true); return; }
  const parts = [];
  for (const p of userMsg.parts || []) {
    if (p.type === "file" && p.url) {
      parts.push({ type: "file", mime: p.mime, filename: p.filename, url: p.url });
    } else if (p.type === "text" && !p.synthetic && p.text) {
      parts.push({ type: "text", text: p.text });
    }
  }
  if (!parts.length) { appendNotice("该消息没有可重新发送的内容", true); return; }
  addReplyVersion(sid, splitSendStamp(messageTextParts(userMsg)).body, messageTextParts(msgs[idx]));
  setBusy(true);
  try {
    await api("/session/" + sid + "/message/" + assistantId, { method: "DELETE", directory: activeDir });
    await api("/session/" + sid + "/message/" + userMsg.info.id, { method: "DELETE", directory: activeDir });
    await selectSession(sid);
    await postPrompt(parts);
  } catch (e) {
    console.error(e);
    appendNotice("重新生成失败：" + e.message, true);
    setBusy(false);
  }
}

function setupAllVersionNavs() {
  for (const id in msgEls) {
    const h = msgEls[id];
    if (h && h.role === "assistant") setupVersionNav(h, precedingUserText(h.el));
  }
}
function setupVersionNav(holder, userText) {
  if (!holder || holder.role !== "assistant" || !userText) return;
  const sid = currentSession && currentSession.id;
  if (!sid) return;
  const el0 = holder.el;
  if (el0.querySelector(".ver-nav")) return;
  const arr = repliesStore()[turnKey(sid, userText)];
  if (!Array.isArray(arr) || !arr.length) return;
  const nav = el("div", "ver-nav");
  const prev = el("button", null, "◀");
  const next = el("button", null, "▶");
  const label = el("span", "ver-idx", "");
  prev.type = "button"; next.type = "button";
  let idx = arr.length;
  const total = arr.length + 1;
  function paint() {
    label.textContent = "版本 " + (idx + 1) + "/" + total + (idx === arr.length ? "（最新）" : "（历史，继续对话以最新版为准）");
    prev.disabled = idx <= 0;
    next.disabled = idx >= arr.length;
    const old = el0.querySelector(".bubble.ver-old");
    if (old) old.remove();
    if (idx === arr.length) {
      el0.classList.remove("show-ver-old");
    } else {
      el0.classList.add("show-ver-old");
      const b = el("div", "bubble ver-old");
      b.__raw = arr[idx].text;
      renderMarkdown(b, arr[idx].text);
      el0.insertBefore(b, nav);
    }
    updateScrollBottom();
  }
  prev.onclick = () => { if (idx > 0) { idx--; paint(); } };
  next.onclick = () => { if (idx < arr.length) { idx++; paint(); } };
  nav.appendChild(prev);
  nav.appendChild(label);
  nav.appendChild(next);
  el0.appendChild(nav);
}
async function editUserMessage(msgId) {
  if (!currentSession || busy) return;
  if (typeof rpProxyRunning !== "undefined" && rpProxyRunning) { showToast("托管进行中，请稍候", true); return; }
  const sid = currentSession.id;
  const entry = msgEls[msgId];
  const text = entry ? messageRawText(entry.el) : "";
  openEditMessage(text, async (newText) => {
    const val = String(newText || "").trim();
    let msgs;
    try { msgs = await api("/session/" + sid + "/message", { directory: activeDir }); }
    catch (e) { appendNotice("编辑失败：" + e.message, true); return; }
    const i = msgs.findIndex(m => m.info.id === msgId);
    if (i < 0) { appendNotice("找不到该消息，请刷新会话", true); return; }
    const fileParts = (msgs[i].parts || []).filter(p => p.type === "file" && p.url)
      .map(p => ({ type: "file", mime: p.mime, filename: p.filename, url: p.url }));
    const parts = fileParts.slice();
    if (val) parts.push({ type: "text", text: val });
    if (!parts.length) { appendNotice("消息内容为空", true); return; }
    showToast("正在清理该消息之后的对话…");
    setBusy(true);
    try {
      for (let k = msgs.length - 1; k >= i; k--) {
        await api("/session/" + sid + "/message/" + msgs[k].info.id, { method: "DELETE", directory: activeDir });
      }
      await selectSession(sid);
      await postPrompt(parts);
    } catch (e) {
      console.error(e);
      appendNotice("编辑重发失败：" + e.message, true);
      setBusy(false);
    }
  });
}
let editMsgCb = null;
function openEditMessage(text, cb) {
  $("editMsgText").value = text || "";
  editMsgCb = cb;
  $("editMsgMask").classList.add("show");
  setTimeout(() => $("editMsgText").focus(), 30);
}
$("editMsgCancel").onclick = () => { $("editMsgMask").classList.remove("show"); editMsgCb = null; };
$("editMsgOk").onclick = () => {
  const v = $("editMsgText").value;
  $("editMsgMask").classList.remove("show");
  const cb = editMsgCb; editMsgCb = null;
  if (cb) cb(v);
};
$("editMsgMask").addEventListener("click", (e) => { if (e.target === $("editMsgMask")) $("editMsgCancel").click(); });

async function stop() {
  if (!currentSession || !busy) return;
  try {
    await api("/session/" + currentSession.id + "/abort", { method: "POST", directory: activeDir });
  } catch (e) { console.error(e); }
}

sendBtn.onclick = send;
stopBtn.onclick = stop;
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});

/* ============ 回到底部 ============ */
const scrollBottomBtn = $("scrollBottom");
function updateScrollBottom() {
  const near = nearBottom();
  scrollBottomBtn.classList.toggle("show", !near && messagesEl.scrollHeight > messagesEl.clientHeight + 40);
}
messagesEl.addEventListener("scroll", () => {
  autoScroll = nearBottom();
  updateScrollBottom();
});
scrollBottomBtn.onclick = () => { autoScroll = true; scrollBottom(true); updateScrollBottom(); };

/* ============ 侧栏折叠 ============ */
function applyCollapsed(c) {
  document.body.classList.toggle("collapsed", c);
  localStorage.setItem("oc_collapsed", c ? "1" : "0");
}
$("toggleSidebar").onclick = () => applyCollapsed(!document.body.classList.contains("collapsed"));
if (localStorage.getItem("oc_collapsed") === "1") applyCollapsed(true);

/* ============ 主题 ============ */
const darkToggle = $("darkToggle");
function applyTheme(dark) {
  document.body.classList.toggle("dark", dark);
  darkToggle.checked = dark;
  localStorage.setItem("oc_theme", dark ? "dark" : "light");
}
darkToggle.onchange = () => applyTheme(darkToggle.checked);
if (localStorage.getItem("oc_theme") === "dark") applyTheme(true);

