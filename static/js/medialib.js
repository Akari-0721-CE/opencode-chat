/* ============ 媒体库：查看 / 管理所有本地媒体内容 ============ */
/* 聚合所有会话历史中「你发送」与「助手贴出」的图片 / 文件（opencode 消息里的
   file part 与 tool.state.attachments），支持查看、存档到本机、添加到对话、
   OCR、定位原消息。存档写入本机 IndexedDB，清理历史后仍保留。 */

const ML_DB = "oc_media_store";
const ML_STORE = "items";
const ML_SCAN_TTL = 60000;
const ML_SCAN_CONCURRENCY = 4;
let mlDbPromise = null;
let mlScanItems = [];
let mlScanAt = 0;
let mlScanning = false;
let mlScanToken = 0;
let mlScanDone = 0;
let mlScanTotal = 0;
let mlView = "history";
let mlQuery = "";
let mlKind = "all";
let mlSource = "all";
let mlArchiveItems = [];
let mlObjectUrls = [];
let mlRenderTimer = null;

/* ---------- 纯函数（可单测） ---------- */
function mediaKindOf(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.indexOf("image/") === 0) return "image";
  if (m.indexOf("video/") === 0) return "video";
  if (m.indexOf("audio/") === 0) return "audio";
  if (m === "application/pdf") return "pdf";
  return "file";
}
function mediaItemKey(mime, url) {
  return mediaKindOf(mime) + "|" + textHash(String(mime || "") + "|" + String(url || ""));
}
function mediaItemsFromParts(parts, ctx) {
  const c = ctx || {};
  const out = [];
  const push = (a) => {
    const url = a && a.url;
    if (!url) return;
    const mime = a.mime || "application/octet-stream";
    out.push({
      id: mediaItemKey(mime, url),
      name: a.filename || a.name || "",
      mime: mime,
      kind: mediaKindOf(mime),
      url: url,
      sessionId: c.sessionId || "",
      sessionTitle: c.sessionTitle || "",
      directory: c.directory || "",
      messageId: c.messageId || "",
      role: c.role || "",
      source: (c.role === "user") ? "user" : "assistant",
      at: c.at || 0,
    });
  };
  for (const p of (parts || [])) {
    if (!p) continue;
    if (p.type === "file" && p.url) push({ url: p.url, mime: p.mime, filename: p.filename });
    if (p.type === "tool" && p.state && Array.isArray(p.state.attachments)) {
      for (const a of p.state.attachments) if (a && a.url) push({ url: a.url, mime: a.mime, filename: a.filename });
    }
  }
  return out;
}
function mediaFilter(items, opts) {
  const o = opts || {};
  const terms = String(o.query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const kind = o.kind || "all";
  const source = o.source || "all";
  return (items || []).filter((it) => {
    if (!it) return false;
    if (kind !== "all" && it.kind !== kind) return false;
    if (source !== "all" && it.source !== source) return false;
    if (terms.length) {
      const hay = ((it.name || "") + " " + (it.sessionTitle || "") + " " + (it.mime || "")).toLowerCase();
      if (!terms.every((t) => hay.indexOf(t) >= 0)) return false;
    }
    return true;
  });
}
function mediaArchiveSummary(list) {
  let bytes = 0;
  for (const it of (list || [])) bytes += (it && it.size) || 0;
  return { count: (list || []).length, bytes: bytes };
}
function mlKindLabel(kind) {
  const m = { image: "图片", video: "视频", audio: "音频", pdf: "PDF", file: "文件" };
  const s = m[kind] || "文件";
  return (typeof t === "function") ? t(s) : s;
}

/* ---------- IndexedDB 存档 ---------- */
function mlDbOpen() {
  if (mlDbPromise) return mlDbPromise;
  mlDbPromise = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) { reject(new Error("IndexedDB 不可用")); return; }
      const req = indexedDB.open(ML_DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(ML_STORE)) req.result.createObjectStore(ML_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("打开 IndexedDB 失败"));
    } catch (e) { reject(e); }
  });
  return mlDbPromise;
}
function mlDbOp(mode, fn) {
  return mlDbOpen().then((db) => new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(ML_STORE, mode); } catch (e) { try { db.close(); } catch (_) { /* ignore */ } reject(e); return; }
    const store = tx.objectStore(ML_STORE);
    let result;
    try { result = fn(store); } catch (e) { reject(e); return; }
    tx.oncomplete = () => { try { db.close(); } catch (_) { /* ignore */ } Promise.resolve(result).then(resolve, reject); };
    tx.onerror = () => { try { db.close(); } catch (_) { /* ignore */ } reject(tx.error || new Error("IndexedDB 事务失败")); };
    tx.onabort = () => { try { db.close(); } catch (_) { /* ignore */ } reject(tx.error || new Error("IndexedDB 事务中止")); };
  }));
}
function mlArchivePut(rec, blob) {
  return mlDbOp("readwrite", (s) => s.put(Object.assign({}, rec, { blob: blob }), rec.id));
}
function mlArchiveDelete(id) { return mlDbOp("readwrite", (s) => s.delete(id)); }
function mlArchiveClear() { return mlDbOp("readwrite", (s) => s.clear()); }
function mlArchiveAll() {
  return mlDbOp("readonly", (s) => new Promise((resolve, reject) => {
    if (typeof s.getAll === "function") {
      const r = s.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
      return;
    }
    const out = [];
    const cur = s.openCursor();
    cur.onsuccess = () => { const c = cur.result; if (c) { out.push(c.value); c.continue(); } else resolve(out); };
    cur.onerror = () => reject(cur.error);
  }));
}

/* ---------- Blob / data URL 互转 ---------- */
function mlIsDataUrl(u) { return /^data:/i.test(String(u || "")); }
function mlDataUrlToBlob(dataUrl) {
  const s = String(dataUrl || "");
  const i = s.indexOf(",");
  if (i < 0) throw new Error("无效的 data URL");
  const head = s.slice(0, i);
  const body = s.slice(i + 1);
  const mime = (head.match(/^data:([^;,]+)/) || [])[1] || "application/octet-stream";
  if (/;base64/i.test(head)) {
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return new Blob([arr], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}
function mlBlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error("读取失败"));
    fr.readAsDataURL(blob);
  });
}
async function mlItemBlob(it) {
  if (it && it.blob) return it.blob;
  if (mlIsDataUrl(it && it.url)) return mlDataUrlToBlob(it.url);
  const res = await fetch(it.url, { credentials: "include" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.blob();
}
async function mlItemDataUrl(it) {
  if (it && mlIsDataUrl(it.url)) return it.url;
  return await mlBlobToDataUrl(await mlItemBlob(it));
}
function mlSrc(it) { return (it && (it.__src || it.url)) || ""; }

/* ---------- 扫描所有会话历史 ---------- */
function mlRenderStatus(shown) {
  const box = $("mediaStatus");
  if (!box) return;
  const tr = (typeof tf === "function") ? tf : (s, ...a) => String(s).replace(/\{(\d+)\}/g, (m, i) => (a[+i] != null ? a[+i] : m));
  if (mlView === "archive") {
    const s = mediaArchiveSummary(mlArchiveItems);
    box.textContent = (shown != null && shown !== s.count)
      ? tr("共 {0} 项 · {1}（显示 {2} 项）", s.count, fmtSize(s.bytes), shown)
      : tr("共 {0} 项 · {1}", s.count, fmtSize(s.bytes));
    return;
  }
  if (mlScanning) { box.textContent = tr("正在扫描媒体…（{0}/{1} 会话）", mlScanDone, mlScanTotal); return; }
  box.textContent = (shown != null && shown !== mlScanItems.length)
    ? tr("共 {0} 项（显示 {1} 项）", mlScanItems.length, shown)
    : tr("共 {0} 项", mlScanItems.length);
}
function mlThrottleRender() {
  if (mlRenderTimer) return;
  mlRenderTimer = setTimeout(() => {
    mlRenderTimer = null;
    if (mlView === "history") mlRender();
  }, 250);
}
async function mlScanAll(force) {
  if (mlScanning) return mlScanItems;
  if (!force && mlScanItems.length && Date.now() - mlScanAt < ML_SCAN_TTL) return mlScanItems;
  mlScanning = true;
  const token = ++mlScanToken;
  if (force) { mlScanItems = []; mlScanAt = 0; }
  const seen = new Set(mlScanItems.map((x) => x.id));
  let sessions = [];
  try { sessions = await ensureAllSessions(force); } catch (e) { sessions = []; }
  const pool = (Array.isArray(sessions) ? sessions : [])
    .filter((s) => s && s.id && !isTrashed(s.id))
    .sort((a, b) => sessionUpdated(b) - sessionUpdated(a));
  mlScanDone = 0;
  mlScanTotal = pool.length;
  if (mlView === "history") mlRender();
  const work = async () => {
    while (token === mlScanToken) {
      const idx = mlScanDone++;
      if (idx >= pool.length) return;
      const s = pool[idx];
      try {
        const msgs = await api("/session/" + s.id + "/message", { directory: s.directory });
        for (const m of (Array.isArray(msgs) ? msgs : [])) {
          const info = (m && m.info) || {};
          const got = mediaItemsFromParts(m && m.parts, {
            sessionId: s.id,
            sessionTitle: s.title || s.id,
            directory: s.directory || "",
            messageId: info.id,
            role: info.role,
            at: (info.time && (info.time.created || info.time.updated)) || sessionUpdated(s),
          });
          for (const it of got) {
            if (seen.has(it.id)) continue;
            seen.add(it.id);
            mlScanItems.push(it);
          }
        }
      } catch (e) { /* 单个会话失败则跳过 */ }
      mlThrottleRender();
    }
  };
  const workers = [];
  const n = Math.max(1, Math.min(ML_SCAN_CONCURRENCY, pool.length || 1));
  for (let i = 0; i < n; i++) workers.push(work());
  await Promise.all(workers);
  if (token !== mlScanToken) return mlScanItems;
  mlScanItems.sort((a, b) => (b.at || 0) - (a.at || 0));
  mlScanning = false;
  mlScanAt = Date.now();
  mlRender();
  return mlScanItems;
}

/* ---------- 渲染 ---------- */
function mlRevokeUrls() {
  for (const u of mlObjectUrls) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }
  mlObjectUrls = [];
}
function mlCard(it, ctx) {
  const isArchive = !!ctx.isArchive;
  const card = el("div", "ml-card");
  const src = mlSrc(it);
  const thumb = el("div", "ml-thumb");
  if (it.kind === "image" && src) {
    const im = document.createElement("img");
    im.loading = "lazy";
    im.src = src;
    im.alt = it.name || "";
    im.onclick = (e) => {
      e.stopPropagation();
      const list = ctx.images.map((x) => ({ src: mlSrc(x), name: x.name || "" }));
      const idx = ctx.images.indexOf(it);
      if (typeof openImageViewer === "function") openImageViewer(src, it.name || "", list, idx < 0 ? 0 : idx);
    };
    thumb.appendChild(im);
  } else {
    const ico = el("div", "ml-file-ico");
    ico.appendChild(iconEl("file"));
    thumb.appendChild(ico);
  }
  thumb.appendChild(el("span", "ml-badge", mlKindLabel(it.kind)));
  card.appendChild(thumb);

  const meta = el("div", "ml-meta");
  meta.appendChild(el("div", "ml-name", it.name || (it.kind === "image" ? "图片" : "文件")));
  const sub = [];
  if (isArchive && it.size) sub.push(fmtSize(it.size));
  if (it.sessionTitle) sub.push(it.sessionTitle);
  if (sub.length) meta.appendChild(el("div", "ml-sub", sub.join(" · ")));
  card.appendChild(meta);

  const actions = el("div", "ml-actions");
  const addAct = (label, title, fn, cls) => {
    const b = el("button", "ml-act" + (cls ? " " + cls : ""), label);
    b.type = "button";
    b.title = title || label;
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    actions.appendChild(b);
  };
  if (isArchive) addAct("删除", "从本机存档中删除", () => mlDeleteArchived(it), "danger");
  else addAct("存档", "存档到本机媒体库", () => mlArchiveItem(it));
  addAct("添加", "添加到对话", () => mlAddToChat(it));
  if (it.kind === "image" && typeof openOcrPanel === "function") addAct("OCR", "识别图片文字", () => mlOcr(it));
  if (typeof isAndroidApp === "function" && isAndroidApp()) addAct("保存", "保存 / 分享到手机", () => mlSaveToPhone(it));
  if (!isArchive && it.sessionId) addAct("定位", "定位到原消息", () => mlLocate(it));
  card.appendChild(actions);
  return card;
}
function mlRender() {
  const grid = $("mediaGrid");
  if (!grid) return;
  mlRevokeUrls();
  grid.innerHTML = "";
  let items;
  if (mlView === "archive") {
    items = mediaFilter(mlArchiveItems, { query: mlQuery, kind: mlKind, source: "all" });
    for (const it of items) {
      if (it.kind !== "image" || !it.blob) continue;
      const u = URL.createObjectURL(it.blob);
      mlObjectUrls.push(u);
      it.__src = u;
    }
  } else {
    items = mediaFilter(mlScanItems, { query: mlQuery, kind: mlKind, source: mlSource });
  }
  items.sort((a, b) => (b.at || 0) - (a.at || 0));
  const images = items.filter((x) => x.kind === "image");
  if (!items.length) {
    const empty = mlView === "archive" ? "本机存档为空" : (mlScanning ? "正在扫描媒体…" : "没有匹配的媒体");
    grid.appendChild(el("div", "ml-empty", (typeof t === "function") ? t(empty) : empty));
  } else {
    for (const it of items) grid.appendChild(mlCard(it, { images: images, isArchive: mlView === "archive" }));
  }
  mlRenderStatus(items.length);
}

/* ---------- 视图切换 / 打开关闭 ---------- */
function mlSetView(v) {
  mlView = (v === "archive") ? "archive" : "history";
  const tabs = $("mediaTabs");
  if (tabs) tabs.querySelectorAll(".ml-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === mlView));
  const src = $("mediaSource");
  if (src) src.disabled = (mlView === "archive");
  const clr = $("mediaClearArchive");
  if (clr) clr.style.display = (mlView === "archive") ? "" : "none";
  mlRender();
}
async function mlLoadArchive() {
  try {
    const list = await mlArchiveAll();
    mlArchiveItems = (Array.isArray(list) ? list : []).sort((a, b) => (b.at || 0) - (a.at || 0));
  } catch (e) { mlArchiveItems = []; }
  return mlArchiveItems;
}
async function openMediaLibrary() {
  const mask = $("mediaMask");
  if (!mask) return;
  mask.classList.add("show");
  mlSetView("history");
  try { await mlScanAll(false); } catch (e) { showToast("扫描媒体失败：" + e.message, true); }
}
function closeMediaLibrary() {
  const mask = $("mediaMask");
  if (mask) mask.classList.remove("show");
  mlRevokeUrls();
}

/* ---------- 单项操作 ---------- */
async function mlArchiveItem(it) {
  try {
    const blob = await mlItemBlob(it);
    const name = it.name || (typeof guessFileName === "function" ? guessFileName(it.url || "", it.kind) : (it.kind + "-" + Date.now()));
    await mlArchivePut({
      id: it.id, name: name, mime: it.mime || blob.type || "application/octet-stream",
      kind: it.kind, size: blob.size || 0, at: Date.now(), source: it.source,
      sessionId: it.sessionId || "", sessionTitle: it.sessionTitle || "",
    }, blob);
    await mlLoadArchive();
    showToast("已存档到本机媒体库");
  } catch (e) {
    showToast("存档失败：" + e.message, true);
  }
}
async function mlDeleteArchived(it) {
  const ok = await confirmDialog({ title: "删除存档", text: "从本机媒体库中删除该项？", okText: "删除", danger: true });
  if (!ok) return;
  try {
    await mlArchiveDelete(it.id);
    await mlLoadArchive();
    mlRender();
    showToast("已删除");
  } catch (e) { showToast("删除失败：" + e.message, true); }
}
async function mlAddToChat(it) {
  try {
    const blob = await mlItemBlob(it);
    const name = it.name || (typeof guessFileName === "function" ? guessFileName(it.url || "", it.kind) : (it.kind + "-" + Date.now()));
    const file = new File([blob], name, { type: it.mime || blob.type || "application/octet-stream" });
    if (typeof addFiles === "function") addFiles([file]);
    showToast("已添加到对话");
  } catch (e) { showToast("添加失败：" + e.message, true); }
}
async function mlOcr(it) {
  try {
    const dataUrl = await mlItemDataUrl(it);
    openOcrPanel([{ name: it.name || "图片", mime: it.mime || "image/png", dataUrl: dataUrl, source: "媒体库" }]);
  } catch (e) { showToast("OCR 失败：" + e.message, true); }
}
async function mlSaveToPhone(it) {
  const n = (typeof ocNative === "function") ? ocNative() : null;
  if (!n || !n.saveDataUrl) { showToast("当前环境不支持保存到手机", true); return; }
  try {
    const dataUrl = await mlItemDataUrl(it);
    const mime = it.mime || (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || "application/octet-stream";
    const name = it.name || (typeof guessFileName === "function" ? guessFileName(it.url || "", it.kind) : (it.kind + "-" + Date.now()));
    n.saveDataUrl(name, mime, dataUrl);
  } catch (e) { showToast("保存失败：" + e.message, true); }
}
async function mlLocate(it) {
  if (!it.sessionId) return;
  const a = (typeof assistantForDir === "function" ? assistantForDir(it.directory) : null) ||
    S.assistants.find((x) => x.id === S.activeId);
  if (!a) { showToast("找不到该会话对应的助手", true); return; }
  closeMediaLibrary();
  pendingScrollMessageId = it.messageId || null;
  await activateAssistant(a.id, { sessionId: it.sessionId });
}

/* ---------- 事件接入 ---------- */
if ($("mediaBtn")) $("mediaBtn").onclick = () => { openMediaLibrary(); };
if ($("mediaClose")) $("mediaClose").onclick = closeMediaLibrary;
if ($("mediaMask")) $("mediaMask").addEventListener("click", (e) => { if (e.target === $("mediaMask")) closeMediaLibrary(); });
if ($("mediaRefresh")) $("mediaRefresh").onclick = () => {
  mlScanAll(true).catch((e) => showToast("扫描媒体失败：" + e.message, true));
};
if ($("mediaSearch")) $("mediaSearch").addEventListener("input", () => { mlQuery = $("mediaSearch").value; mlRender(); });
if ($("mediaKind")) $("mediaKind").addEventListener("change", () => { mlKind = $("mediaKind").value; mlRender(); });
if ($("mediaSource")) $("mediaSource").addEventListener("change", () => { mlSource = $("mediaSource").value; mlRender(); });
if ($("mediaTabs")) $("mediaTabs").addEventListener("click", (e) => {
  const b = e.target && e.target.closest ? e.target.closest(".ml-tab") : null;
  if (!b) return;
  const view = b.dataset.view;
  const go = () => mlSetView(view);
  if (view === "archive") mlLoadArchive().then(go, go);
  else go();
});
if ($("mediaClearArchive")) $("mediaClearArchive").onclick = async () => {
  const ok = await confirmDialog({ title: "清空存档", text: "清空本机媒体库中的全部存档？该操作不可恢复。", okText: "清空", danger: true });
  if (!ok) return;
  try { await mlArchiveClear(); await mlLoadArchive(); mlRender(); showToast("已清空存档"); }
  catch (e) { showToast("清空失败：" + e.message, true); }
};
