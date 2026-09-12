/* ============ 翻译（用低cost模型，经临时会话完成） ============ */
const TR_KEY_MODEL = "oc_translate_model";
const TR_KEY_PROMPT = "oc_translate_prompt";
const TR_KEY_VARIANT = "oc_translate_variant";
const TR_TIMEOUT_MS = 120000;
const TR_DEFAULT_PROMPT = [
  "你是翻译引擎。把用户给出的内容翻译成简体中文；若原文本身已是中文，则翻译成英文。",
  "要求：",
  "1. 只输出译文，不要解释、不要前言后语、不要加引号。",
  "2. 保留原有 Markdown 结构、代码块、行内代码、命令、URL、文件路径、变量名与专有名词。",
  "3. 代码内容本身不翻译，只翻译其中的自然语言。",
].join("\n");

const trCache = new Map();

function translateModelRef() {
  try {
    const o = JSON.parse(localStorage.getItem(TR_KEY_MODEL) || "null");
    if (o && o.providerID && o.id) return { providerID: o.providerID, id: o.id };
  } catch (e) { /* ignore */ }
  return null;
}
function translateModelValue() {
  const r = translateModelRef();
  return r ? modelKey(r.providerID, r.id) : "";
}
function translatePrompt() {
  const v = localStorage.getItem(TR_KEY_PROMPT);
  return (v && v.trim()) ? v : TR_DEFAULT_PROMPT;
}
function translateVariant() {
  const v = localStorage.getItem(TR_KEY_VARIANT);
  if (v != null) return v;
  const ref = translateModelRef() || fallbackModel();
  return variantsOf(ref).indexOf("none") >= 0 ? "none" : "";
}
function translateModelLabel() {
  const r = translateModelRef();
  if (!r) return "当前助手模型";
  return modelDisplayName(r);
}

/* ============ 设置项 ============ */
function fillTranslateVariants() {
  const sel = $("trVariant");
  if (!sel) return;
  const vs = variantsOf(translateModelRef() || fallbackModel());
  sel.innerHTML = "";
  const def = document.createElement("option");
  def.value = "";
  def.textContent = "（默认：非思考）";
  sel.appendChild(def);
  for (const v of vs) {
    if (v === "none") continue;
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }
  if (vs.indexOf("none") < 0) {
    const n = document.createElement("option");
    n.value = "none";
    n.textContent = "非思考";
    sel.appendChild(n);
  }
  const cur = localStorage.getItem(TR_KEY_VARIANT);
  sel.value = cur == null ? "" : cur;
}
function updateTranslateUI() {
  const lbl = $("trModelPickLabel");
  if (lbl) lbl.textContent = translateModelRef() ? translateModelLabel() : "（未设置，用助手模型）";
  const ta = $("trPrompt");
  if (ta && document.activeElement !== ta) ta.value = translatePrompt();
  fillTranslateVariants();
}
function renderTranslateModelList() {
  const box = $("trModelList");
  const q = ($("trModelSearch") && $("trModelSearch").value) || "";
  renderModelItems(box, q, translateModelValue(), (v) => { setTranslateModel(v); closeTrModelPop(); }, "（未设置，用助手模型）", renderTranslateModelList);
}
function setTranslateModel(val) {
  if (!val) localStorage.removeItem(TR_KEY_MODEL);
  else {
    const r = parseModelKey(val);
    if (r) localStorage.setItem(TR_KEY_MODEL, JSON.stringify(r));
  }
  updateTranslateUI();
}
function openTrModelPop() {
  const p = $("trModelPop");
  if (!p) return;
  if ($("trModelSearch")) $("trModelSearch").value = "";
  p.hidden = false;
  renderTranslateModelList();
  setTimeout(() => { if ($("trModelSearch")) $("trModelSearch").focus(); }, 20);
}
function closeTrModelPop() {
  const p = $("trModelPop");
  if (p) p.hidden = true;
}

if ($("trModelPickBtn")) {
  $("trModelPickBtn").onclick = (e) => {
    e.stopPropagation();
    const p = $("trModelPop");
    if (p && p.hidden) openTrModelPop(); else closeTrModelPop();
  };
}
if ($("trModelSearch")) {
  $("trModelSearch").addEventListener("input", renderTranslateModelList);
  $("trModelSearch").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeTrModelPop(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const first = $("trModelList").querySelector(".model-item");
      if (first) first.click();
    }
  });
}
document.addEventListener("click", (e) => {
  const pick = $("trModelPick");
  if (pick && !pick.contains(e.target)) closeTrModelPop();
});
let trPromptTimer = null;
if ($("trPrompt")) {
  $("trPrompt").addEventListener("input", () => {
    if (trPromptTimer) clearTimeout(trPromptTimer);
    trPromptTimer = setTimeout(() => {
      const v = $("trPrompt").value;
      if (!v || !v.trim() || v === TR_DEFAULT_PROMPT) localStorage.removeItem(TR_KEY_PROMPT);
      else localStorage.setItem(TR_KEY_PROMPT, v);
    }, 400);
  });
}
if ($("trPromptReset")) $("trPromptReset").onclick = () => {
  localStorage.removeItem(TR_KEY_PROMPT);
  $("trPrompt").value = TR_DEFAULT_PROMPT;
  showToast("已恢复默认翻译提示词");
};
if ($("trVariant")) $("trVariant").onchange = () => {
  const v = $("trVariant").value;
  if (v) localStorage.setItem(TR_KEY_VARIANT, v);
  else localStorage.removeItem(TR_KEY_VARIANT);
};
if ($("trVariantReset")) $("trVariantReset").onclick = () => {
  localStorage.removeItem(TR_KEY_VARIANT);
  fillTranslateVariants();
  showToast("已恢复默认翻译思考强度");
};
if ($("trModelReset")) $("trModelReset").onclick = () => {
  localStorage.removeItem(TR_KEY_MODEL);
  updateTranslateUI();
  showToast("已清除翻译模型");
};
if ($("settingsBtn")) $("settingsBtn").addEventListener("click", () => updateTranslateUI());
updateTranslateUI();

/* ============ 执行翻译 ============ */
function translateScratchDir() {
  const home = String(homeDir || "").replace(/[\\/]+$/, "");
  if (!home) return "";
  return home + "\\.config\\opencode-chat\\translate-scratch";
}
async function ensureTranslateScratch() {
  const dir = translateScratchDir();
  if (!dir) throw new Error("无法确定翻译临时目录");
  await ensureWorkspaceDir(dir);
  return dir;
}
async function sweepTranslateScratch() {
  const dir = translateScratchDir();
  if (!dir) return;
  try {
    const list = await api("/session", { directory: dir });
    for (const s of (Array.isArray(list) ? list : [])) {
      try { await api("/session/" + s.id, { method: "DELETE", directory: dir }); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
}
function sleepMs(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitTranslateText(dir, sid) {
  const t0 = Date.now();
  while (Date.now() - t0 < TR_TIMEOUT_MS) {
    let msgs = null;
    try { msgs = await api("/session/" + sid + "/message", { directory: dir }); } catch (e) { msgs = null; }
    if (Array.isArray(msgs)) {
      const last = [...msgs].reverse().find(m => m.info && m.info.role === "assistant");
      if (last && last.info.time && last.info.time.completed) return messageTextParts(last).trim();
    }
    await sleepMs(500);
  }
  return "";
}
async function translateText(text) {
  const ref = translateModelRef() || fallbackModel();
  if (!ref) throw new Error("未配置翻译模型，且当前助手没有默认模型");
  const dir = await ensureTranslateScratch();
  await sweepTranslateScratch();
  let sid = null;
  try {
    const ts = await api("/session", {
      method: "POST", directory: dir,
      headers: { "Content-Type": "application/json" }, body: "{}",
    });
    sid = ts.id;
    const body = { parts: [{ type: "text", text }], system: BASE_OVERRIDE_MARK + "\n" + translatePrompt() };
    body.model = { providerID: ref.providerID, modelID: ref.id || ref.modelID };
    if (allToolIds.length) body.tools = Object.fromEntries(allToolIds.map(id => [id, false]));
    const vs = variantsOf(ref);
    const variant = translateVariant();
    if (variant === "none") { if (vs.indexOf("none") >= 0) body.variant = "none"; }
    else if (variant && vs.indexOf(variant) >= 0) body.variant = variant;
    await api("/session/" + sid + "/prompt_async", {
      method: "POST", directory: dir,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return await waitTranslateText(dir, sid);
  } finally {
    if (sid) { try { await api("/session/" + sid, { method: "DELETE", directory: dir }); } catch (e) { /* ignore */ } }
  }
}

/* ============ 消息翻译按钮 ============ */
async function toggleTranslation(wrap, btn) {
  const sid = currentSession && currentSession.id;
  const mid = wrap.dataset.id;
  const existing = wrap.querySelector(".msg-translation");
  if (existing) { existing.hidden = !existing.hidden; return; }
  const text = messageRawText(wrap);
  if (!text) return;
  const ref = translateModelRef() || fallbackModel();
  if (!ref) { showToast("未配置翻译模型，且当前助手没有默认模型", true); return; }
  const box = el("div", "msg-translation");
  const label = el("div", "tr-label", "翻译中…");
  const body = el("div", "tr-body");
  box.append(label, body);
  const actions = wrap.querySelector(".msg-actions");
  if (actions) wrap.insertBefore(box, actions); else wrap.appendChild(box);
  btn.disabled = true;
  try {
    const key = sid + "|" + mid + "|" + textHash(translatePrompt());
    let out = trCache.get(key);
    if (!out) { out = await translateText(text); if (out) trCache.set(key, out); }
    if (!out) throw new Error("翻译结果为空（可能超时）");
    label.textContent = "翻译 · " + translateModelLabel();
    body.__raw = out;
    renderMarkdown(body, out);
  } catch (e) {
    box.classList.add("error");
    label.textContent = "翻译失败：" + e.message;
  } finally {
    btn.disabled = false;
  }
}
