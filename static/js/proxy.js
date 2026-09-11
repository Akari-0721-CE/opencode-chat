/* ============ 对话托管（用指定助手代替用户发言） ============ */
const RP_PROXY_KEY = "oc_rp_proxy";
const RP_PROXY_MAX_AUTO = 20;
const RP_PROXY_TRANSCRIPT_LIMIT = 40;
const RP_PROXY_TIMEOUT_MS = 180000;
const RP_PROXY_INSTRUCTION = [
  "【对话托管任务】",
  "你正在代替「用户」一方，续写这个角色扮演对话中用户的下一条发言。",
  "要求：",
  "1. 只输出用户方接下来要说的话或做的动作本身，不要任何解释、标题或前缀（如“用户：”“我的回复：”）。",
  "2. 与对话中用户一贯的身份、语气、文风保持一致；若用户此前没有说话，则按你系统设定中的角色来扮演用户。",
  "3. 不要替其它角色发言，不要复述或总结剧情，不要使用任何工具。",
  "4. 直接输出正文即可。",
].join("\n");

let rpProxyRunning = false;
let rpProxyAuto = false;
let rpProxyRemaining = 0;
let rpProxyCancel = false;

function rpProxyAssistant() {
  const id = localStorage.getItem(RP_PROXY_KEY);
  if (!id) return null;
  return S.assistants.find(a => a.id === id) || null;
}

function rpProxySetAssistant(id) {
  if (id) localStorage.setItem(RP_PROXY_KEY, id);
  else localStorage.removeItem(RP_PROXY_KEY);
}

function rpProxyModelLabel(proxy) {
  const ref = (proxy && proxy.model) || fallbackModel();
  if (!ref) return "";
  const m = findModel({ providerID: ref.providerID, modelID: ref.id || ref.modelID });
  return m ? (m.name || m.id) : (ref.id || ref.modelID || "");
}

function renderProxySelect() {
  const sel = $("proxyAsst");
  if (!sel) return;
  const cur = sel.value || localStorage.getItem(RP_PROXY_KEY) || "";
  sel.innerHTML = "";
  const none = el("option", null, "（未选择）");
  none.value = "";
  sel.appendChild(none);
  for (const a of S.assistants) {
    const o = el("option", null, a.name || "未命名");
    o.value = a.id;
    sel.appendChild(o);
  }
  sel.value = S.assistants.some(a => a.id === cur) ? cur : "";
}

function setProxyStatus(text) {
  const s = $("proxyStatus");
  if (s) s.textContent = text || "";
}

function updateProxyUI() {
  const active = rpProxyAuto || rpProxyRunning;
  const btn = $("proxyBtn");
  if (btn) {
    const a = rpProxyAssistant();
    btn.classList.toggle("on", active);
    btn.title = a ? ("对话托管：" + (a.name || "未命名")) : "对话托管（点击选择托管助手）";
  }
  const auto = $("proxyAuto");
  if (auto) {
    auto.textContent = active ? "停止" : "自动托管";
    auto.classList.toggle("stopping", active);
  }
  const one = $("proxyOne");
  if (one) one.disabled = active;
  const wrap = document.querySelector(".input-wrap");
  if (wrap) wrap.classList.toggle("hosting", active);
}

function openProxyPop() {
  renderProxySelect();
  const pop = $("proxyPop");
  if (pop) pop.hidden = false;
  updateProxyUI();
}
function closeProxyPop() {
  const pop = $("proxyPop");
  if (pop) pop.hidden = true;
}

/* ============ 托管思考展示 ============ */
function hostingNoteEl(create) {
  let n = $("hostingNote");
  if (!n && create) {
    n = el("div", "hosting-note");
    n.id = "hostingNote";
    const head = el("div", "hn-head");
    head.appendChild(el("span", "hn-title", "托管思考"));
    const close = el("button", "hn-close", "×");
    close.type = "button";
    close.title = "收起";
    close.onclick = () => clearHostingNote();
    head.appendChild(close);
    n.appendChild(head);
    n.appendChild(el("div", "hn-body"));
    messagesEl.appendChild(n);
  }
  return n;
}
function setHostingNote(reasoning, label) {
  if (!reasoning || !reasoning.trim()) return;
  const n = hostingNoteEl(true);
  const title = n.querySelector(".hn-title");
  if (title) title.textContent = "托管思考" + (label ? " · " + label : "");
  const body = n.querySelector(".hn-body");
  if (body && body.textContent !== reasoning) body.textContent = reasoning;
  if (typeof autoScroll !== "undefined" && autoScroll) scrollBottom();
}
function clearHostingNote() {
  const n = $("hostingNote");
  if (n) n.remove();
}

function proxyTranscript(msgs) {
  const lines = [];
  for (const m of msgs.slice(-RP_PROXY_TRANSCRIPT_LIMIT)) {
    const role = m.info && m.info.role;
    const txt = messageTextParts(m).trim();
    if (!txt) continue;
    lines.push((role === "user" ? "【用户】" : "【对方】") + " " + txt);
  }
  return lines.join("\n\n");
}

function messageReasoningText(m) {
  return ((m && m.parts) || []).filter(p => p.type === "reasoning" && p.text).map(p => p.text).join("\n\n").trim();
}

function buildProxySystem(proxy) {
  const parts = [];
  if (proxy && proxy.system && proxy.system.trim()) parts.push(proxy.system.trim());
  parts.push(RP_PROXY_INSTRUCTION);
  parts.push(paramsMarker(proxy));
  return BASE_OVERRIDE_MARK + (parts.length ? "\n" + parts.join("\n\n") : "");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitProxyText(dir, sid, onThink) {
  const t0 = Date.now();
  while (Date.now() - t0 < RP_PROXY_TIMEOUT_MS) {
    if (rpProxyCancel) return null;
    let msgs = null;
    try { msgs = await api("/session/" + sid + "/message", { directory: dir }); } catch (e) { msgs = null; }
    if (Array.isArray(msgs)) {
      const last = [...msgs].reverse().find(m => m.info && m.info.role === "assistant");
      if (last) {
        const reasoning = messageReasoningText(last);
        if (reasoning && onThink) onThink(reasoning);
        if (last.info.time && last.info.time.completed) {
          return { text: messageTextParts(last).trim(), reasoning };
        }
      }
    }
    await sleep(600);
  }
  return { text: "", reasoning: "" };
}

async function runProxyStep() {
  if (rpProxyRunning || busy) return false;
  if (!currentSession) { showToast("请先选择一个会话", true); return false; }
  const proxy = rpProxyAssistant();
  if (!proxy) { showToast("请先选择托管助手", true); openProxyPop(); return false; }
  const dir = activeDir;
  const mainSid = currentSession.id;
  const modelLabel = rpProxyModelLabel(proxy);
  rpProxyRunning = true;
  rpProxyCancel = false;
  clearHostingNote();
  updateProxyUI();
  setProxyStatus("正在生成用户发言…");
  let tempSid = null;
  try {
    let msgs = await api("/session/" + mainSid + "/message", { directory: dir });
    const transcript = proxyTranscript(Array.isArray(msgs) ? msgs : []);
    if (!transcript.trim()) { showToast("当前会话还没有可参考的对话", true); return false; }

    const ts = await api("/session", {
      method: "POST", directory: dir,
      headers: { "Content-Type": "application/json" }, body: "{}",
    });
    tempSid = ts.id;

    const ref = proxy.model || fallbackModel();
    const body = { parts: [{ type: "text", text: transcript + "\n\n【任务】请写出「用户」接下来的一条发言（只输出内容本身）。" }] };
    if (ref) body.model = { providerID: ref.providerID, modelID: ref.id || ref.modelID };
    if (proxy.agent) body.agent = proxy.agent;
    body.system = buildProxySystem(proxy);
    if (allToolIds.length) body.tools = Object.fromEntries(allToolIds.map(id => [id, false]));
    const vs = variantsOf(proxy.model || fallbackModel());
    if (proxy.variant === "none") { if (vs.indexOf("none") >= 0) body.variant = "none"; }
    else if (proxy.variant && vs.indexOf(proxy.variant) >= 0) body.variant = proxy.variant;

    await api("/session/" + tempSid + "/prompt_async", {
      method: "POST", directory: dir,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

    const out = await waitProxyText(dir, tempSid, (r) => setHostingNote(r, modelLabel));
    if (out === null) { showToast("已取消托管"); return false; }
    if (!out.text) { showToast("托管生成超时或为空", true); return false; }
    setHostingNote(out.reasoning, modelLabel);

    await api("/session/" + tempSid, { method: "DELETE", directory: dir }).catch(() => {});
    tempSid = null;

    if (!currentSession || currentSession.id !== mainSid) { showToast("会话已切换，已取消发送", true); return false; }
    autoScroll = true;
    await postPrompt([{ type: "text", text: out.text }]);
    return true;
  } catch (e) {
    console.error(e);
    showToast("托管失败：" + e.message, true);
    return false;
  } finally {
    if (tempSid) { api("/session/" + tempSid, { method: "DELETE", directory: dir }).catch(() => {}); }
    rpProxyRunning = false;
    if (!rpProxyAuto) setProxyStatus("");
    updateProxyUI();
  }
}

async function rpProxyTick() {
  if (!rpProxyAuto || rpProxyRemaining <= 0) { stopProxyAuto(); return; }
  rpProxyRemaining--;
  setProxyStatus("自动托管中，剩余 " + (rpProxyRemaining + 1) + " 轮");
  updateProxyUI();
  const ok = await runProxyStep();
  if (!ok) stopProxyAuto();
}

function startProxyAuto(n) {
  if (!currentSession) { showToast("请先选择一个会话", true); return; }
  if (!rpProxyAssistant()) { showToast("请先选择托管助手", true); openProxyPop(); return; }
  rpProxyAuto = true;
  rpProxyRemaining = Math.max(1, Math.min(RP_PROXY_MAX_AUTO, n || 1));
  updateProxyUI();
  rpProxyTick();
}

function stopProxyAuto() {
  rpProxyAuto = false;
  rpProxyRemaining = 0;
  rpProxyCancel = true;
  setProxyStatus("");
  updateProxyUI();
}

function maybeAutoProxyNext() {
  if (!rpProxyAuto || rpProxyRunning) return;
  if (rpProxyRemaining <= 0) { stopProxyAuto(); return; }
  setTimeout(() => { if (rpProxyAuto) rpProxyTick(); }, 800);
}

/* ============ 绑点 ============ */
const proxyBtn = $("proxyBtn");
if (proxyBtn) {
  proxyBtn.onclick = (e) => {
    e.stopPropagation();
    const pop = $("proxyPop");
    if (pop && !pop.hidden) closeProxyPop();
    else openProxyPop();
  };
}
const proxyAsstSel = $("proxyAsst");
if (proxyAsstSel) proxyAsstSel.onchange = () => { rpProxySetAssistant(proxyAsstSel.value); updateProxyUI(); };
const proxyOneBtn = $("proxyOne");
if (proxyOneBtn) proxyOneBtn.onclick = () => { if (!rpProxyRunning && !rpProxyAuto) runProxyStep(); };
const proxyAutoBtn = $("proxyAuto");
if (proxyAutoBtn) {
  proxyAutoBtn.onclick = () => {
    if (rpProxyAuto || rpProxyRunning) { stopProxyAuto(); if (rpProxyRunning) rpProxyCancel = true; return; }
    const n = parseInt(($("proxyTurns") || {}).value, 10) || 1;
    startProxyAuto(n);
  };
}
document.addEventListener("click", (e) => {
  const pop = $("proxyPop");
  if (!pop || pop.hidden) return;
  if (pop.contains(e.target)) return;
  if (proxyBtn && (e.target === proxyBtn || proxyBtn.contains(e.target))) return;
  closeProxyPop();
});
