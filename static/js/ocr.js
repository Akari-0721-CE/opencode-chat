/* ============ OCR（用模型识别图片文字，经临时会话完成） ============ */
const OCR_KEY_MODEL = "oc_ocr_model";
const OCR_KEY_PROMPT = "oc_ocr_prompt";
const OCR_KEY_VARIANT = "oc_ocr_variant";
const OCR_TIMEOUT_MS = 180000;
const OCR_TEXT_PREFIX = "【图片 OCR：";
const OCR_DEFAULT_PROMPT = [
  "你是 OCR 引擎。识别图片中的所有文字，按阅读顺序原样输出。",
  "要求：",
  "1. 只输出识别到的文字，不要翻译、不要解释、不要总结、不要加任何前后语。",
  "2. 尽量保留原文的换行与分段；表格用 Markdown 表格或简单的对齐文本表示。",
  "3. 遇到无法辨认的字符用 □ 代替；图片没有任何文字时输出空字符串。",
].join("\n");

const ocrCache = new Map();

/* ---------- 纯函数（可单测） ---------- */
function isOcrModelName(m) {
  if (!m) return false;
  return /ocr/i.test(String(m.id || "") + " " + String(m.name || ""));
}
function isVisionModel(m) {
  if (!m) return false;
  const c = m.capabilities || {};
  if (c.input && c.input.image === true) return true;
  if (c.attachment === true) return true;
  return false;
}
function ocrDisplayKeyFromParts(parts) {
  const texts = (parts || [])
    .filter(p => p && p.type === "text" && typeof p.text === "string" && p.text.indexOf(OCR_TEXT_PREFIX) === 0)
    .map(p => p.text);
  if (!texts.length) return "";
  return textHash(texts.join("\n\n"));
}

/* ---------- 设置项 ---------- */
function ocrModelRef() {
  try {
    const o = JSON.parse(localStorage.getItem(OCR_KEY_MODEL) || "null");
    if (o && o.providerID && o.id) return { providerID: o.providerID, id: o.id };
  } catch (e) { /* ignore */ }
  return null;
}
function ocrModelValue() {
  const r = ocrModelRef();
  return r ? modelKey(r.providerID, r.id) : "";
}
function ocrPrompt() {
  const v = localStorage.getItem(OCR_KEY_PROMPT);
  return (v && v.trim()) ? v : OCR_DEFAULT_PROMPT;
}
function ocrVariant() {
  const v = localStorage.getItem(OCR_KEY_VARIANT);
  if (v != null) return v;
  const ref = ocrModelRef() || fallbackModel();
  return variantsOf(ref).indexOf("none") >= 0 ? "none" : "";
}
function ocrModelLabel() {
  const r = ocrModelRef();
  return r ? modelDisplayName(r) : "未设置";
}
function recommendedOcrModels() {
  const out = [];
  for (const prov of modelsByProvider) {
    for (const m of prov.models) {
      if (isOcrModelName(m)) out.push({ providerID: m.providerID, id: m.id, name: m.name || m.id, prov: prov.name || prov.id });
    }
  }
  return out;
}

function fillOcrVariants() {
  const sel = $("ocrVariant");
  if (!sel) return;
  const vs = variantsOf(ocrModelRef() || fallbackModel());
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
  const cur = localStorage.getItem(OCR_KEY_VARIANT);
  sel.value = cur == null ? "" : cur;
}
function renderOcrRecommend() {
  const box = $("ocrRecommend");
  if (!box) return;
  box.innerHTML = "";
  const recs = recommendedOcrModels();
  if (recs.length) {
    box.appendChild(document.createTextNode("检测到专用 OCR 模型（点击选用）："));
    for (const r of recs) {
      const b = el("button", "mini-link", r.name);
      b.type = "button";
      b.title = r.prov + " / " + r.id;
      b.onclick = () => { setOcrModel(modelKey(r.providerID, r.id)); showToast("已选择 " + r.name); };
      box.appendChild(b);
    }
    box.appendChild(document.createTextNode("（个别专用模型在 opencode 下可能因 max_tokens / 上下文限制报错，此时改用视觉模型即可）"));
    return;
  }
  const vis = [];
  for (const prov of modelsByProvider) {
    for (const m of prov.models) {
      if (isVisionModel(m)) vis.push({ providerID: m.providerID, id: m.id, name: m.name || m.id, prov: prov.name || prov.id });
      if (vis.length >= 4) break;
    }
    if (vis.length >= 4) break;
  }
  if (!vis.length) { box.textContent = "未检测到专用 OCR 或视觉模型，可在上方手动选择。"; return; }
  box.appendChild(document.createTextNode("未检测到专用 OCR 模型；可试这些视觉模型（点击选用）："));
  for (const r of vis) {
    const b = el("button", "mini-link", r.name);
    b.type = "button";
    b.title = r.prov + " / " + r.id;
    b.onclick = () => { setOcrModel(modelKey(r.providerID, r.id)); showToast("已选择 " + r.name); };
    box.appendChild(b);
  }
}
function updateOcrUI() {
  const lbl = $("ocrModelPickLabel");
  if (lbl) lbl.textContent = ocrModelRef() ? ocrModelLabel() : "（未设置）";
  const ta = $("ocrPrompt");
  if (ta && document.activeElement !== ta) ta.value = ocrPrompt();
  const sel = $("ocrVariant");
  if (sel) fillOcrVariants();
  renderOcrRecommend();
}
function renderOcrModelList() {
  const box = $("ocrModelList");
  if (!box) return;
  const q = ($("ocrModelSearch") && $("ocrModelSearch").value) || "";
  renderModelItems(box, q, ocrModelValue(), (v) => { setOcrModel(v); closeOcrModelPop(); }, "（未设置）", renderOcrModelList);
}
function setOcrModel(val) {
  if (!val) localStorage.removeItem(OCR_KEY_MODEL);
  else {
    const r = parseModelKey(val);
    if (r) localStorage.setItem(OCR_KEY_MODEL, JSON.stringify(r));
  }
  updateOcrUI();
}
function openOcrModelPop() {
  const p = $("ocrModelPop");
  if (!p) return;
  if ($("ocrModelSearch")) $("ocrModelSearch").value = "";
  p.hidden = false;
  renderOcrModelList();
  setTimeout(() => { if ($("ocrModelSearch")) $("ocrModelSearch").focus(); }, 20);
}
function closeOcrModelPop() {
  const p = $("ocrModelPop");
  if (p) p.hidden = true;
}
if ($("ocrModelPickBtn")) {
  $("ocrModelPickBtn").onclick = (e) => {
    e.stopPropagation();
    const p = $("ocrModelPop");
    if (p && p.hidden) openOcrModelPop(); else closeOcrModelPop();
  };
}
if ($("ocrModelSearch")) {
  $("ocrModelSearch").addEventListener("input", renderOcrModelList);
  $("ocrModelSearch").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeOcrModelPop(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const first = $("ocrModelList").querySelector(".model-item");
      if (first) first.click();
    }
  });
}
document.addEventListener("click", (e) => {
  const pick = $("ocrModelPick");
  if (pick && !pick.contains(e.target)) closeOcrModelPop();
});
let ocrPromptTimer = null;
if ($("ocrPrompt")) {
  $("ocrPrompt").addEventListener("input", () => {
    if (ocrPromptTimer) clearTimeout(ocrPromptTimer);
    ocrPromptTimer = setTimeout(() => {
      const v = $("ocrPrompt").value;
      if (!v || !v.trim() || v === OCR_DEFAULT_PROMPT) localStorage.removeItem(OCR_KEY_PROMPT);
      else localStorage.setItem(OCR_KEY_PROMPT, v);
    }, 400);
  });
}
if ($("ocrPromptReset")) $("ocrPromptReset").onclick = () => {
  localStorage.removeItem(OCR_KEY_PROMPT);
  $("ocrPrompt").value = OCR_DEFAULT_PROMPT;
  showToast("已恢复默认 OCR 提示词");
};
if ($("ocrVariant")) $("ocrVariant").onchange = () => {
  const v = $("ocrVariant").value;
  if (v) localStorage.setItem(OCR_KEY_VARIANT, v);
  else localStorage.removeItem(OCR_KEY_VARIANT);
};
if ($("ocrVariantReset")) $("ocrVariantReset").onclick = () => {
  localStorage.removeItem(OCR_KEY_VARIANT);
  fillOcrVariants();
  showToast("已恢复默认 OCR 思考强度");
};
if ($("ocrModelReset")) $("ocrModelReset").onclick = () => {
  localStorage.removeItem(OCR_KEY_MODEL);
  updateOcrUI();
  showToast("已清除 OCR 模型");
};
if ($("settingsBtn")) $("settingsBtn").addEventListener("click", () => updateOcrUI());
updateOcrUI();

/* ---------- 临时会话执行 OCR ---------- */
function ocrScratchDir() {
  const home = String(homeDir || "").replace(/[\\/]+$/, "");
  if (!home) return "";
  return home + "\\.config\\opencode-chat\\ocr-scratch";
}
async function ensureOcrScratch() {
  const dir = ocrScratchDir();
  if (!dir) throw new Error("无法确定 OCR 临时目录");
  await ensureWorkspaceDir(dir);
  return dir;
}
async function sweepOcrScratch() {
  const dir = ocrScratchDir();
  if (!dir) return;
  try {
    const list = await api("/session", { directory: dir });
    for (const s of (Array.isArray(list) ? list : [])) {
      try { await api("/session/" + s.id, { method: "DELETE", directory: dir }); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
}
function sleepOcrMs(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitOcrText(dir, sid) {
  const t0 = Date.now();
  while (Date.now() - t0 < OCR_TIMEOUT_MS) {
    let msgs = null;
    try { msgs = await api("/session/" + sid + "/message", { directory: dir }); } catch (e) { msgs = null; }
    if (Array.isArray(msgs)) {
      const last = [...msgs].reverse().find(m => m.info && m.info.role === "assistant");
      if (last && last.info.time && last.info.time.completed) return messageTextParts(last).trim();
    }
    await sleepOcrMs(500);
  }
  return "";
}
function ocrCacheKey(dataUrl, mime) {
  return "o|" + textHash(String(mime || "") + "|" + String(dataUrl || "")) + "|" + textHash(ocrPrompt()) + "|" + JSON.stringify(ocrModelRef() || null);
}
async function ocrImage(dataUrl, mime, name) {
  const ref = ocrModelRef();
  if (!ref) throw new Error("未配置 OCR 模型（设置 → 高级 → OCR 模型）");
  const key = ocrCacheKey(dataUrl, mime);
  if (ocrCache.has(key)) return ocrCache.get(key);
  const dir = await ensureOcrScratch();
  await sweepOcrScratch();
  let sid = null;
  try {
    const ts = await api("/session", {
      method: "POST", directory: dir,
      headers: { "Content-Type": "application/json" }, body: "{}",
    });
    sid = ts.id;
    const body = {
      parts: [{ type: "file", mime: mime || "image/png", filename: name || "image", url: dataUrl }],
      system: BASE_OVERRIDE_MARK + "\n" + ocrPrompt(),
    };
    body.model = { providerID: ref.providerID, modelID: ref.id || ref.modelID };
    if (allToolIds.length) body.tools = Object.fromEntries(allToolIds.map(id => [id, false]));
    const vs = variantsOf(ref);
    const variant = ocrVariant();
    if (variant === "none") { if (vs.indexOf("none") >= 0) body.variant = "none"; }
    else if (variant && vs.indexOf(variant) >= 0) body.variant = variant;
    await api("/session/" + sid + "/prompt_async", {
      method: "POST", directory: dir,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const out = await waitOcrText(dir, sid);
    ocrCache.set(key, out);
    return out;
  } finally {
    if (sid) { try { await api("/session/" + sid, { method: "DELETE", directory: dir }); } catch (e) { /* ignore */ } }
  }
}

/* ---------- 本地图片保留（IndexedDB，不写入 localStorage） ---------- */
const OCR_DB_NAME = "oc_ocr_images";
function ocrDbOpen() {
  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) { reject(new Error("IndexedDB 不可用")); return; }
      const req = indexedDB.open(OCR_DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("images")) req.result.createObjectStore("images"); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("打开 IndexedDB 失败"));
    } catch (e) { reject(e); }
  });
}
function ocrDbTx(mode, fn) {
  return ocrDbOpen().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction("images", mode);
    const store = tx.objectStore("images");
    let result;
    try { result = fn(store); } catch (e) { reject(e); return; }
    tx.oncomplete = () => { try { db.close(); } catch (e) { /* ignore */ } resolve(result); };
    tx.onerror = () => { try { db.close(); } catch (e) { /* ignore */ } reject(tx.error || new Error("IndexedDB 事务失败")); };
  }));
}
function ocrImgPut(key, images) {
  return ocrDbTx("readwrite", (store) => store.put(images, key));
}
function ocrImgGet(key) {
  return ocrDbTx("readonly", (store) => {
    return new Promise((resolve, reject) => {
      const r = store.get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  });
}

/* ---------- 把本地保留的图片注入已发送的用户消息 ---------- */
function attachLocalOcrImages(holder, images) {
  if (!holder || !holder.el) return;
  holder.el.dataset.ocrLocal = "1";
  const strip = el("div", "ocr-local-imgs");
  for (const im of images) {
    const btn = el("button", "ocr-local-img");
    btn.type = "button";
    const img = document.createElement("img");
    img.src = im.dataUrl;
    img.alt = im.name || "image";
    btn.title = (im.name || "图片") + "（本地保留，未发送给模型）";
    btn.appendChild(img);
    btn.onclick = () => { if (typeof openImageViewer === "function") openImageViewer(im.dataUrl, im.name); };
    strip.appendChild(btn);
  }
  holder.el.appendChild(strip);
}
async function maybeAttachLocalOcrImages(holder) {
  if (!holder || !holder.el || holder.role !== "user") return;
  if (holder.__ocrLoading || holder.el.dataset.ocrLocal === "1" || holder.el.dataset.ocrLocalNone === "1") return;
  const bubbles = Array.from(holder.el.querySelectorAll(".bubble")).filter((b) => {
    const raw = b.__raw !== undefined ? b.__raw : b.textContent;
    return typeof raw === "string" && raw.indexOf(OCR_TEXT_PREFIX) === 0;
  });
  if (!bubbles.length) return;
  const key = textHash(bubbles.map((b) => (b.__raw !== undefined ? b.__raw : b.textContent)).join("\n\n"));
  holder.__ocrLoading = true;
  try {
    const images = await ocrImgGet(key);
    if (images && images.length) attachLocalOcrImages(holder, images);
    else holder.el.dataset.ocrLocalNone = "1";
  } catch (e) {
    holder.el.dataset.ocrLocalNone = "1";
  } finally {
    holder.__ocrLoading = false;
  }
}

/* ---------- 自动 OCR：发送时把图片转成文本 part ---------- */
function ocrProgressStart(total) {
  const box = $("ocrProgress");
  const text = $("ocrProgressText");
  if (box) box.hidden = false;
  if (text) text.textContent = (typeof tf === "function") ? tf("正在 OCR 识图（0/{0}）…", total) : ("正在 OCR 识图（0/" + total + "）…");
  if (sendBtn) { sendBtn.classList.add("ocr-working"); sendBtn.title = "正在 OCR 识图，请稍候…"; }
  document.body.classList.add("ocr-busy");
}
function ocrProgressStep(done, total, name) {
  const text = $("ocrProgressText");
  if (text) text.textContent = (typeof tf === "function") ? tf("正在 OCR 识图（{0}/{1}）：{2}", done, total, name || "图片") : ("正在 OCR 识图（" + done + "/" + total + "）：" + (name || "图片"));
}
function ocrProgressEnd() {
  const box = $("ocrProgress");
  if (box) box.hidden = true;
  if (sendBtn) { sendBtn.classList.remove("ocr-working"); sendBtn.title = "发送"; }
  document.body.classList.remove("ocr-busy");
}
async function buildOcrSendParts(atts, userText, onProgress) {
  const parts = [];
  const images = [];
  const list = (atts || []).filter(at => at.kind === "image" && at.dataUrl);
  let done = 0;
  for (const at of (atts || [])) {
    if (at.kind === "image" && at.dataUrl) {
      done++;
      if (typeof onProgress === "function") onProgress(done, list.length, at.name);
      const txt = await ocrImage(at.dataUrl, at.mime, at.name);
      parts.push({ type: "text", text: OCR_TEXT_PREFIX + (at.name || "图片") + "】\n" + (txt || "（未识别到文字）") });
      images.push({ name: at.name, mime: at.mime, dataUrl: at.dataUrl });
    } else if (at.dataUrl) {
      parts.push({ type: "file", mime: at.mime, filename: at.name, url: at.dataUrl });
    }
  }
  if (userText) parts.push({ type: "text", text: userText });
  return { parts, images };
}

/* ---------- 批量 OCR 面板 ---------- */
let ocrItems = [];
function ocrMimeOf(src) {
  const m = String(src || "").match(/^data:(image\/[a-z0-9.+-]+)/i);
  return m ? m[1] : "image/png";
}
function collectSessionImages() {
  const out = [];
  const seen = new Set();
  messagesEl.querySelectorAll(".bubble img, .msg-file img, .ocr-local-img img").forEach((img) => {
    const src = img.src || "";
    if (!/^data:image\//i.test(src)) return;
    const k = textHash(src);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ name: img.alt || "图片", mime: ocrMimeOf(src), dataUrl: src, source: "会话" });
  });
  return out;
}
function newOcrItem(im, source) {
  const cached = ocrCache.get(ocrCacheKey(im.dataUrl, im.mime));
  return {
    id: uid("ocr"), name: im.name || "图片", mime: im.mime || ocrMimeOf(im.dataUrl),
    dataUrl: im.dataUrl, text: cached || "", status: cached ? "done" : "idle", source: source || "",
  };
}
function openOcrPanel(seed) {
  if (!currentSession && !(seed && seed.length)) { showToast("请先选择一个会话", true); return; }
  const seen = new Set();
  const items = [];
  const add = (im, source) => {
    if (!im || !im.dataUrl) return;
    const k = textHash(im.dataUrl);
    if (seen.has(k)) return;
    seen.add(k);
    items.push(newOcrItem(im, source));
  };
  if (seed && seed.length) for (const im of seed) add(im, im.source || "图片");
  else {
    for (const at of attachments) if (at.kind === "image") add(at, "附件");
    for (const im of collectSessionImages()) add(im, im.source);
  }
  ocrItems = items;
  renderOcrPanel();
  $("ocrMask").classList.add("show");
}
function closeOcrPanel() { $("ocrMask").classList.remove("show"); }
function ocrStatusLabel(it) {
  if (it.status === "running") return "识别中";
  if (it.status === "done") return "已完成";
  if (it.status === "error") return "失败";
  return "待识别";
}
function renderOcrPanel() {
  const box = $("ocrList");
  if (!box) return;
  box.innerHTML = "";
  if (!ocrItems.length) { box.appendChild(el("div", "fav-empty", "没有可识别的图片（附件或当前会话中的图片）")); }
  for (const it of ocrItems) {
    const row = el("div", "ocr-item");
    const thumb = document.createElement("img");
    thumb.className = "ocr-thumb";
    thumb.src = it.dataUrl;
    thumb.alt = it.name;
    row.appendChild(thumb);

    const mid = el("div", "ocr-mid");
    mid.appendChild(el("div", "ocr-name", it.name + (it.source ? " · " + it.source : "")));
    const ta = document.createElement("textarea");
    ta.className = "ocr-text";
    ta.placeholder = "点击右侧「识别」开始…";
    ta.value = it.text || "";
    ta.addEventListener("input", () => { it.text = ta.value; });
    mid.appendChild(ta);
    row.appendChild(mid);

    const side = el("div", "ocr-side");
    side.appendChild(el("span", "ocr-status " + (it.status || "idle"), ocrStatusLabel(it)));
    const bRun = el("button", "mini-link", it.status === "running" ? "…" : "识别");
    bRun.type = "button";
    bRun.disabled = it.status === "running";
    bRun.onclick = () => runOneOcr(it);
    side.appendChild(bRun);
    const bCopy = el("button", "mini-link", "复制");
    bCopy.type = "button";
    bCopy.disabled = !it.text;
    bCopy.onclick = () => copyOcrText(it.text);
    side.appendChild(bCopy);
    row.appendChild(side);
    box.appendChild(row);
  }
  const runAll = $("ocrRunAll");
  if (runAll) runAll.disabled = !ocrItems.length || ocrItems.every(i => i.status === "done" || i.status === "running");
}
async function runOneOcr(it) {
  if (!ocrModelRef()) { showToast("请先在 设置 → 高级 → OCR 模型 里选择模型", true); it.status = "error"; renderOcrPanel(); return; }
  it.status = "running";
  renderOcrPanel();
  try {
    const t = await ocrImage(it.dataUrl, it.mime, it.name);
    it.text = t || "";
    it.status = "done";
  } catch (e) {
    it.status = "error";
    showToast("OCR 失败：" + e.message, true);
  }
}
async function runAllOcr() {
  const todo = ocrItems.filter(i => i.status !== "done");
  if (!todo.length) { showToast("没有待识别的图片"); return; }
  if (!ocrModelRef()) { showToast("请先在 设置 → 高级 → OCR 模型 里选择模型", true); return; }
  for (const it of todo) await runOneOcr(it);
  renderOcrPanel();
}
function copyOcrText(text) {
  const t = String(text || "");
  if (!t) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => showToast("已复制"), () => showToast("复制失败", true));
  } else {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); showToast("已复制"); } catch (e) { showToast("复制失败", true); }
    document.body.removeChild(ta);
  }
}
function copyAllOcr() {
  const done = ocrItems.filter(i => i.text);
  if (!done.length) { showToast("还没有识别结果"); return; }
  copyOcrText(done.map(i => "【" + i.name + "】\n" + i.text).join("\n\n"));
}
function insertOcrToInput() {
  const done = ocrItems.filter(i => i.text);
  if (!done.length) { showToast("还没有识别结果"); return; }
  const text = done.map(i => "【" + i.name + "】\n" + i.text).join("\n\n");
  if (input.value.trim()) input.value = input.value.replace(/\s*$/, "") + "\n\n" + text;
  else input.value = text;
  updateSendState();
  closeOcrPanel();
}
if ($("ocrBtn")) $("ocrBtn").onclick = () => openOcrPanel();
if ($("ocrRunAll")) $("ocrRunAll").onclick = runAllOcr;
if ($("ocrCopyAll")) $("ocrCopyAll").onclick = copyAllOcr;
if ($("ocrInsert")) $("ocrInsert").onclick = insertOcrToInput;
if ($("ocrClose")) $("ocrClose").onclick = closeOcrPanel;
if ($("ocrMask")) $("ocrMask").addEventListener("click", (e) => { if (e.target === $("ocrMask")) closeOcrPanel(); });
