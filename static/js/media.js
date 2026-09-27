/* ============ 图片查看器（相册式：捏合缩放 / 拖动 / 双击 / 左右切换 / 下滑关闭） ============ */
const imgViewer = $("imgViewer");
const ivStage = $("ivStage");
const ivImg = $("ivImg");
let ivScale = 1, ivX = 0, ivY = 0;
let ivList = [];
let ivIndex = 0;
const IV_MIN = 0.8, IV_MAX = 8;
let ivMoved = false;

function ivApply() { ivImg.style.transform = "translate(" + ivX + "px," + ivY + "px) scale(" + ivScale + ")"; }
function ivReset() { ivScale = 1; ivX = 0; ivY = 0; ivImg.style.opacity = "1"; ivApply(); }
function ivClampScale(s) { return Math.min(IV_MAX, Math.max(IV_MIN, s)); }
function ivZoomAt(factor, cx, cy) {
  const rect = ivStage.getBoundingClientRect();
  const px = cx - rect.left - rect.width / 2;
  const py = cy - rect.top - rect.height / 2;
  const prev = ivScale;
  const next = ivClampScale(ivScale * factor);
  if (next === prev) return;
  ivX = px - (px - ivX) * (next / prev);
  ivY = py - (py - ivY) * (next / prev);
  ivScale = next;
  ivApply();
}
function ivZoomCenter(factor) {
  const rect = ivStage.getBoundingClientRect();
  ivZoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
}
function ivUpdateChrome() {
  const n = ivList.length;
  const cur = ivList[ivIndex];
  if ($("ivName")) $("ivName").textContent = cur ? (cur.name || "") : "";
  if ($("ivCount")) $("ivCount").textContent = n > 1 ? ((ivIndex + 1) + " / " + n) : "";
  if ($("ivPrev")) $("ivPrev").disabled = n <= 1;
  if ($("ivNext")) $("ivNext").disabled = n <= 1;
  if ($("ivOpen")) $("ivOpen").href = cur ? cur.src : "#";
}
function ivShow(index) {
  if (!ivList.length) return;
  ivIndex = ((index % ivList.length) + ivList.length) % ivList.length;
  const cur = ivList[ivIndex];
  ivImg.src = cur.src;
  ivReset();
  ivUpdateChrome();
  for (const d of [1, -1]) {
    if (ivList.length < 2) break;
    const nb = ivList[((ivIndex + d) % ivList.length + ivList.length) % ivList.length];
    if (nb && nb.src) { try { const im = new Image(); im.src = nb.src; } catch (e) { /* ignore */ } }
  }
}
function ivNext() { if (ivList.length > 1) ivShow(ivIndex + 1); }
function ivPrev() { if (ivList.length > 1) ivShow(ivIndex - 1); }

function openImageViewer(src, name, list, index) {
  if (!src) return;
  if (Array.isArray(list) && list.length) {
    ivList = list.map((x) => (x && x.src) ? { src: x.src, name: x.name || "" } : { src: String(x), name: "" });
    let i = (typeof index === "number" && index >= 0) ? index : ivList.findIndex((x) => x.src === src);
    if (i < 0 || !ivList[i] || ivList[i].src !== src) { ivList.unshift({ src: src, name: name || "" }); i = 0; }
    ivIndex = i;
  } else {
    ivList = [{ src: src, name: name || "" }];
    ivIndex = 0;
  }
  ivMoved = false;
  try { ivPointers.clear(); } catch (e) { /* ignore */ }
  ivSwipe = null; ivPinch = null;
  ivShow(ivIndex);
  imgViewer.classList.add("show");
}
function closeImageViewer() {
  imgViewer.classList.remove("show");
  ivStage.classList.remove("dragging");
  ivImg.removeAttribute("style");
  ivImg.src = "";
  ivList = []; ivIndex = 0;
  ivMoved = false;
  try { ivPointers.clear(); } catch (e) { /* ignore */ }
  ivSwipe = null; ivPinch = null;
}

/* ---------- 手势：单指拖动 / 双指捏合 / 双击 / 左右切换 / 下滑关闭 ---------- */
const ivPointers = new Map();
let ivPinch = null;
let ivSwipe = null;
let ivLastTapAt = 0, ivLastTapX = 0, ivLastTapY = 0;

function ivMid() {
  const pts = Array.from(ivPointers.values());
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[1];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
}
ivStage.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  ivMoved = false;
  ivPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { ivStage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (ivPointers.size === 1) {
    ivSwipe = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: ivX, oy: ivY, moved: false, mode: ivScale > 1.02 ? "pan" : "swipe" };
    ivPinch = null;
  } else if (ivPointers.size === 2) {
    ivSwipe = null;
    const m = ivMid();
    if (m) ivPinch = { dist: m.dist, scale: ivScale, x: m.x, y: m.y, ox: ivX, oy: ivY };
  }
  ivStage.classList.add("dragging");
});
ivStage.addEventListener("pointermove", (e) => {
  if (!ivPointers.has(e.pointerId)) return;
  ivPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ivPointers.size >= 2 && ivPinch) {
    const m = ivMid();
    if (m && ivPinch.dist > 0) {
      const ns = ivClampScale(ivPinch.scale * (m.dist / ivPinch.dist));
      const rect = ivStage.getBoundingClientRect();
      const px = ivPinch.x - rect.left - rect.width / 2;
      const py = ivPinch.y - rect.top - rect.height / 2;
      const ratio = ns / ivPinch.scale;
      ivScale = ns;
      ivX = px - (px - ivPinch.ox) * ratio + (m.x - ivPinch.x);
      ivY = py - (py - ivPinch.oy) * ratio + (m.y - ivPinch.y);
      ivApply();
      ivMoved = true;
    }
    return;
  }
  if (ivSwipe && ivSwipe.id === e.pointerId) {
    const dx = e.clientX - ivSwipe.x, dy = e.clientY - ivSwipe.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { ivMoved = true; ivSwipe.moved = true; }
    if (ivSwipe.mode === "pan") { ivX = ivSwipe.ox + dx; ivY = ivSwipe.oy + dy; ivApply(); }
    else if (ivSwipe.moved) {
      const ty = dy > 0 ? dy : 0;
      ivImg.style.transform = "translate(" + dx + "px," + ty + "px) scale(" + ivScale + ")";
      ivImg.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / 420 - ty / 520));
    }
  }
});
function ivEndPointer(e) {
  const sw = (ivSwipe && ivSwipe.id === e.pointerId) ? ivSwipe : null;
  ivPointers.delete(e.pointerId);
  try { ivStage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (ivPointers.size === 0) {
    ivStage.classList.remove("dragging");
    if (sw && sw.moved && sw.mode !== "pan") {
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { closeImageViewer(); ivSwipe = null; ivPinch = null; return; }
      if (dx <= -55) ivNext();
      else if (dx >= 55) ivPrev();
      else { ivImg.style.opacity = "1"; ivApply(); }
    } else {
      ivImg.style.opacity = "1"; ivApply();
    }
    if (!ivMoved) {
      const now = Date.now();
      if (now - ivLastTapAt < 300 && Math.abs(e.clientX - ivLastTapX) < 40 && Math.abs(e.clientY - ivLastTapY) < 40) {
        ivLastTapAt = 0;
        if (ivScale > 1.02) ivReset(); else ivZoomAt(2.5, e.clientX, e.clientY);
      } else {
        ivLastTapAt = now; ivLastTapX = e.clientX; ivLastTapY = e.clientY;
      }
    }
    ivSwipe = null; ivPinch = null;
  } else if (ivPointers.size === 1) {
    ivPinch = null;
    const p = Array.from(ivPointers.entries())[0];
    ivSwipe = { id: p[0], x: p[1].x, y: p[1].y, ox: ivX, oy: ivY, moved: false, mode: ivScale > 1.02 ? "pan" : "swipe" };
  }
}
ivStage.addEventListener("pointerup", ivEndPointer);
ivStage.addEventListener("pointercancel", ivEndPointer);
ivStage.addEventListener("wheel", (e) => {
  e.preventDefault();
  ivZoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
}, { passive: false });
imgViewer.addEventListener("click", (e) => {
  if ((e.target === imgViewer || e.target === ivStage) && !ivMoved) closeImageViewer();
});
$("ivClose").onclick = closeImageViewer;
$("ivReset").onclick = ivReset;
$("ivZoomIn").onclick = () => ivZoomCenter(1.25);
$("ivZoomOut").onclick = () => ivZoomCenter(0.8);
if ($("ivPrev")) $("ivPrev").onclick = ivPrev;
if ($("ivNext")) $("ivNext").onclick = ivNext;
if ($("ivAddChat")) $("ivAddChat").onclick = async () => {
  const cur = ivList[ivIndex];
  if (!cur) return;
  try {
    const res = await fetch(cur.src, { credentials: "include" });
    const blob = await res.blob();
    const name = cur.name || (typeof guessFileName === "function" ? guessFileName(cur.src, "image") : "image.png");
    const file = new File([blob], name, { type: blob.type || "image/png" });
    if (typeof addFiles === "function") addFiles([file]);
    showToast("已添加到对话");
  } catch (e) { showToast("添加失败：" + e.message, true); }
};
document.addEventListener("keydown", (e) => {
  if (!imgViewer.classList.contains("show")) return;
  if (e.key === "Escape") closeImageViewer();
  else if (e.key === "ArrowLeft") { e.preventDefault(); ivPrev(); }
  else if (e.key === "ArrowRight") { e.preventDefault(); ivNext(); }
  else if (e.key === "+" || e.key === "=") { e.preventDefault(); ivZoomCenter(1.25); }
  else if (e.key === "-") { e.preventDefault(); ivZoomCenter(0.8); }
  else if (e.key === "0") { e.preventDefault(); ivReset(); }
});

function ivGalleryFrom(container, img) {
  if (!container || !container.querySelectorAll) return null;
  const imgs = Array.from(container.querySelectorAll("img")).filter((im) => {
    if (im.closest(".msg-avatar, .avatar, .avatar-preview")) return false;
    return !!(im.currentSrc || im.src);
  });
  if (!imgs.length) return null;
  const list = imgs.map((im) => ({ src: im.currentSrc || im.src, name: im.getAttribute("alt") || "" }));
  let idx = imgs.indexOf(img);
  if (idx < 0) idx = 0;
  return { list: list, idx: idx };
}
function handleImageClick(e) {
  const img = e.target && e.target.closest ? e.target.closest("img") : null;
  if (!img) return;
  if (img.closest(".msg-avatar, .avatar, .avatar-preview")) return;
  const src = img.currentSrc || img.src;
  if (!src) return;
  e.preventDefault();
  e.stopPropagation();
  const container = img.closest("#messages") || img.closest("#attachments") ||
    img.closest("#ocrList") || img.closest(".file-preview") || messagesEl;
  const g = ivGalleryFrom(container, img);
  openImageViewer(src, img.getAttribute("alt") || "", g ? g.list : null, g ? g.idx : 0);
}
messagesEl.addEventListener("click", handleImageClick, true);
attachmentsEl.addEventListener("click", handleImageClick, true);

/* ============ 背景（本地图片 / 本地视频 / 动态预设） ============ */
const bgLayer = $("bgLayer");
const bgOverlay = $("bgOverlay");
const bgVideo = $("bgVideo");
const bgCanvas = $("bgCanvas");
const dimRange = $("dimRange");
const dimVal = $("dimVal");
const bgKindSel = $("bgKind");

const BG_PRESETS = ["aurora", "starfield", "particles", "grid"];
const BG_DB = "oc_bg_store";
let bgVideoUrl = null;
let bgAnimId = null;
let bgAnimKind = null;
let bgStars = [];
let bgParts = [];

function applyOverlay() {
  const dim = parseInt(dimRange.value, 10) / 100;
  bgOverlay.style.background = "rgba(0,0,0," + (dim * 0.9).toFixed(2) + ")";
  dimVal.textContent = dimRange.value + "%";
  try { localStorage.setItem("oc_bg_dim", dimRange.value); } catch (e) { /* ignore */ }
}

function bgKind() {
  try {
    const k = localStorage.getItem("oc_bg_kind");
    if (k) return k;
    return localStorage.getItem("oc_bg") ? "image" : "none";
  } catch (e) { return "none"; }
}
function setBgKind(kind) {
  try { localStorage.setItem("oc_bg_kind", kind); } catch (e) { /* ignore */ }
  if (bgKindSel) bgKindSel.value = kind;
}

/* ---------- 本地视频（IndexedDB 持久化） ---------- */
function bgDbOpen() {
  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) { reject(new Error("IndexedDB 不可用")); return; }
      const req = indexedDB.open(BG_DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("media")) req.result.createObjectStore("media"); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("打开 IndexedDB 失败"));
    } catch (e) { reject(e); }
  });
}
function bgDbOp(mode, fn) {
  return bgDbOpen().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction("media", mode);
    const store = tx.objectStore("media");
    let result;
    try { result = fn(store); } catch (e) { reject(e); return; }
    tx.oncomplete = () => { try { db.close(); } catch (e) { /* ignore */ } resolve(result); };
    tx.onerror = () => { try { db.close(); } catch (e) { /* ignore */ } reject(tx.error || new Error("IndexedDB 事务失败")); };
  }));
}
function bgSetVideo(blob) { return bgDbOp("readwrite", (s) => s.put(blob, "video")); }
function bgDelVideo() { return bgDbOp("readwrite", (s) => s.delete("video")); }
function bgGetVideo() {
  return bgDbOp("readonly", (s) => new Promise((resolve, reject) => {
    const r = s.get("video");
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  }));
}

/* ---------- 图层显示 ---------- */
function stopBgAnimation(clear) {
  if (bgAnimId) { cancelAnimationFrame(bgAnimId); bgAnimId = null; }
  if (clear) bgAnimKind = null;
}
function hideBgLayers() {
  stopBgAnimation(true);
  bgLayer.style.backgroundImage = "";
  bgCanvas.style.display = "none";
  bgVideo.style.display = "none";
  try { bgVideo.pause(); } catch (e) { /* ignore */ }
}
function loadBgVideo() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return bgGetVideo().then((blob) => {
    if (!blob) return null;
    if (bgVideoUrl) { try { URL.revokeObjectURL(bgVideoUrl); } catch (e) { /* ignore */ } }
    bgVideoUrl = URL.createObjectURL(blob);
    bgVideo.src = bgVideoUrl;
    bgVideo.style.display = "block";
    if (!lowPerfEnabled()) { const p = bgVideo.play(); if (p && p.catch) p.catch(() => {}); }
    return bgVideoUrl;
  }).catch(() => null);
}
function applyBackground() {
  const kind = bgKind();
  hideBgLayers();
  if (bgKindSel) bgKindSel.value = kind;
  if (kind === "image") {
    const data = localStorage.getItem("oc_bg");
    if (data) bgLayer.style.backgroundImage = 'url("' + data + '")';
  } else if (kind === "video") {
    loadBgVideo();
  } else if (BG_PRESETS.indexOf(kind) >= 0) {
    startBgAnimation(kind);
  }
}
function applyBackgroundQuality(q) {
  if (bgAnimKind) {
    if (q === "low") { stopBgAnimation(false); drawBgFrame(bgAnimKind); }
    else if (!bgAnimId) { startBgAnimation(bgAnimKind); }
    return;
  }
  if (bgKind() === "video") {
    if (q === "low") { try { bgVideo.pause(); } catch (e) { /* ignore */ } }
    else { const p = bgVideo.play(); if (p && p.catch) p.catch(() => {}); }
  }
}

/* ---------- 动态预设（本机 canvas 绘制） ---------- */
function bgCanvasSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  bgCanvas.width = Math.max(1, Math.floor(w * dpr));
  bgCanvas.height = Math.max(1, Math.floor(h * dpr));
  bgCanvas.style.width = w + "px";
  bgCanvas.style.height = h + "px";
  const ctx = bgCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, w: w, h: h };
}
function initPreset(kind) {
  const w = window.innerWidth, h = window.innerHeight;
  if (kind === "starfield") {
    bgStars = [];
    const n = Math.min(240, Math.round(w * h / 9000));
    for (let i = 0; i < n; i++) bgStars.push({ x: Math.random() * w, y: Math.random() * h, z: Math.random() * 1.6 + 0.2, s: Math.random() * 1.4 + 0.3 });
  } else if (kind === "particles") {
    bgParts = [];
    const n = Math.min(90, Math.round(w * h / 24000));
    for (let i = 0; i < n; i++) bgParts.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: Math.random() * 1.8 + 0.8 });
  }
}
function drawAurora(ctx, w, h, t) {
  ctx.fillStyle = "#070b18";
  ctx.fillRect(0, 0, w, h);
  const blobs = [
    { c: "rgba(16,163,127,0.50)", x: 0.30, y: 0.35, r: 0.60 },
    { c: "rgba(80,120,255,0.42)", x: 0.72, y: 0.38, r: 0.62 },
    { c: "rgba(180,80,255,0.34)", x: 0.50, y: 0.72, r: 0.68 },
  ];
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const cx = (b.x + Math.sin(t * 0.12 + i * 2) * 0.12) * w;
    const cy = (b.y + Math.cos(t * 0.10 + i) * 0.10) * h;
    const rad = b.r * Math.max(w, h);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, b.c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
function drawStarfield(ctx, w, h, t) {
  ctx.fillStyle = "#05060e";
  ctx.fillRect(0, 0, w, h);
  if (!bgStars.length) initPreset("starfield");
  for (const s of bgStars) {
    const y = (s.y + t * 12 * s.z) % h;
    ctx.globalAlpha = Math.min(1, 0.30 + s.z * 0.45);
    ctx.fillStyle = "#dfe8ff";
    ctx.fillRect(s.x, y, s.s, s.s);
  }
  ctx.globalAlpha = 1;
}
function drawParticles(ctx, w, h, t) {
  ctx.fillStyle = "#06070f";
  ctx.fillRect(0, 0, w, h);
  if (!bgParts.length) initPreset("particles");
  for (const p of bgParts) {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > w) p.vx *= -1;
    if (p.y < 0 || p.y > h) p.vy *= -1;
  }
  ctx.fillStyle = "rgba(120,200,255,0.75)";
  for (const p of bgParts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = "rgba(120,200,255,0.20)";
  ctx.lineWidth = 1;
  const maxD = 118, maxD2 = maxD * maxD;
  for (let i = 0; i < bgParts.length; i++) {
    for (let j = i + 1; j < bgParts.length; j++) {
      const a = bgParts[i], b = bgParts[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < maxD2) {
        ctx.globalAlpha = 1 - Math.sqrt(d2) / maxD;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}
function drawGrid(ctx, w, h, t) {
  ctx.fillStyle = "#070a14";
  ctx.fillRect(0, 0, w, h);
  const horizon = h * 0.42;
  ctx.strokeStyle = "rgba(16,163,127,0.30)";
  ctx.lineWidth = 1;
  const cols = 24;
  for (let i = 0; i <= cols; i++) {
    const x = (i / cols) * w;
    ctx.beginPath();
    ctx.moveTo(w / 2 + (x - w / 2) * 1.25, h);
    ctx.lineTo(w / 2 + (x - w / 2) * 0.14, horizon);
    ctx.stroke();
  }
  const rows = 14;
  const off = (t * 0.12) % 1;
  for (let i = 0; i <= rows; i++) {
    const f = (i + off) / rows;
    const y = horizon + Math.pow(f, 2) * (h - horizon);
    ctx.globalAlpha = Math.min(1, f * 1.4) * 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawBgFrame(kind) {
  const c = bgCanvasSize();
  bgCanvas.style.display = "block";
  c.ctx.clearRect(0, 0, c.w, c.h);
  if (kind === "aurora") drawAurora(c.ctx, c.w, c.h, 0);
  else if (kind === "starfield") drawStarfield(c.ctx, c.w, c.h, 0);
  else if (kind === "particles") drawParticles(c.ctx, c.w, c.h, 0);
  else if (kind === "grid") drawGrid(c.ctx, c.w, c.h, 0);
}
function startBgAnimation(kind) {
  stopBgAnimation(false);
  bgAnimKind = kind;
  bgCanvas.style.display = "block";
  initPreset(kind);
  if (lowPerfEnabled()) { drawBgFrame(kind); return; }
  const t0 = performance.now();
  const step = (now) => {
    if (bgAnimKind !== kind) return;
    const t = (now - t0) / 1000;
    const c = bgCanvasSize();
    c.ctx.clearRect(0, 0, c.w, c.h);
    if (kind === "aurora") drawAurora(c.ctx, c.w, c.h, t);
    else if (kind === "starfield") drawStarfield(c.ctx, c.w, c.h, t);
    else if (kind === "particles") drawParticles(c.ctx, c.w, c.h, t);
    else if (kind === "grid") drawGrid(c.ctx, c.w, c.h, t);
    bgAnimId = requestAnimationFrame(step);
  };
  bgAnimId = requestAnimationFrame(step);
}

/* ---------- 选择 / 清除 ---------- */
function bgPickFile(accept, onFile) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = accept;
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) onFile(f); };
  inp.click();
}
if ($("bgPickImage")) $("bgPickImage").onclick = () => bgPickFile("image/*", (file) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const W = Math.min(window.innerWidth, 1920);
    const H = Math.min(window.innerHeight, 1080);
    const scale = Math.max(W / img.width, H / img.height);
    const sw = W / scale, sh = H / scale;
    const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    try { localStorage.setItem("oc_bg", canvas.toDataURL("image/jpeg", 0.85)); }
    catch (e) { showToast("图片过大，保存失败", true); }
    setBgKind("image");
    applyBackground();
    URL.revokeObjectURL(url);
  };
  img.src = url;
});
if ($("bgPickVideo")) $("bgPickVideo").onclick = () => bgPickFile("video/*", (file) => {
  if (typeof indexedDB === "undefined") { showToast("当前环境不支持本地视频背景", true); return; }
  bgSetVideo(file).then(() => {
    setBgKind("video");
    applyBackground();
    showToast("视频背景已保存到本机");
  }).catch((e) => showToast("保存视频失败：" + e.message, true));
});
if ($("bgClear")) $("bgClear").onclick = () => {
  setBgKind("none");
  try { localStorage.removeItem("oc_bg"); } catch (e) { /* ignore */ }
  if (typeof indexedDB !== "undefined") bgDelVideo().catch(() => {});
  applyBackground();
};
if (bgKindSel) bgKindSel.onchange = () => {
  const k = bgKindSel.value;
  if (k === "image" && !localStorage.getItem("oc_bg")) { showToast("请先点「选择图片」", true); bgKindSel.value = bgKind(); return; }
  setBgKind(k);
  applyBackground();
};
let bgResizeTimer = null;
window.addEventListener("resize", () => {
  if (bgResizeTimer) clearTimeout(bgResizeTimer);
  bgResizeTimer = setTimeout(() => {
    if (bgAnimKind) { initPreset(bgAnimKind); if (!bgAnimId) drawBgFrame(bgAnimKind); }
  }, 200);
});
dimRange.oninput = applyOverlay;

/* boot 时恢复背景 */
function loadBg() {
  const dim = localStorage.getItem("oc_bg_dim");
  if (dim !== null) dimRange.value = dim;
  applyOverlay();
  applyBackground();
}

/* ============ 图片裁剪 ============ */
const cropCanvas = $("cropCanvas");
const cropCtx = cropCanvas.getContext("2d");
const cropZoom = $("cropZoom");
const cropRatiosEl = $("cropRatios");
const cropMask = $("cropMask");
const CROP_STAGE = 300;
const crop = { img: null, iw: 0, ih: 0, frameW: 0, frameH: 0, base: 1, z: 1, ox: 0, oy: 0, ratio: 1, done: null, dragging: false, lastX: 0, lastY: 0, ratios: [], outSize: 1024, outMime: "image/webp", queue: [], results: [], states: [], pos: 0, opts: null, batch: false };

function cropClamp() {
  const dw = crop.iw * crop.base * crop.z, dh = crop.ih * crop.base * crop.z;
  crop.ox = dw <= crop.frameW ? (crop.frameW - dw) / 2 : Math.min(0, Math.max(crop.frameW - dw, crop.ox));
  crop.oy = dh <= crop.frameH ? (crop.frameH - dh) / 2 : Math.min(0, Math.max(crop.frameH - dh, crop.oy));
}
function cropDraw() {
  cropCtx.clearRect(0, 0, crop.frameW, crop.frameH);
  const s = crop.base * crop.z;
  cropCtx.drawImage(crop.img, crop.ox, crop.oy, crop.iw * s, crop.ih * s);
}
function cropSetZoom(nz) {
  nz = Math.min(4, Math.max(1, nz));
  const sOld = crop.base * crop.z, sNew = crop.base * nz;
  const cx = (crop.frameW / 2 - crop.ox) / sOld;
  const cy = (crop.frameH / 2 - crop.oy) / sOld;
  crop.z = nz;
  crop.ox = crop.frameW / 2 - cx * sNew;
  crop.oy = crop.frameH / 2 - cy * sNew;
  cropClamp();
  cropDraw();
  cropZoom.value = String(Math.round(crop.z * 100));
  if (typeof syncRangeFill === "function") syncRangeFill(cropZoom);
}
function cropSetFrame(reset) {
  const r = crop.ratio;
  if (r >= 1) { crop.frameW = CROP_STAGE; crop.frameH = Math.round(CROP_STAGE / r); }
  else { crop.frameH = CROP_STAGE; crop.frameW = Math.round(CROP_STAGE * r); }
  cropCanvas.width = crop.frameW;
  cropCanvas.height = crop.frameH;
  if (reset) {
    crop.base = Math.max(crop.frameW / crop.iw, crop.frameH / crop.ih);
    crop.z = 1;
    crop.ox = (crop.frameW - crop.iw * crop.base) / 2;
    crop.oy = (crop.frameH - crop.ih * crop.base) / 2;
  }
  cropClamp();
  cropSetZoom(crop.z);
}
function cropRenderRatios() {
  cropRatiosEl.innerHTML = "";
  for (const r of crop.ratios) {
    const b = el("button", "crop-ratio" + (Math.abs(r.value - crop.ratio) < 1e-6 ? " on" : ""), r.label);
    b.type = "button";
    b.onclick = () => { crop.ratio = r.value; cropRenderRatios(); cropSetFrame(true); };
    cropRatiosEl.appendChild(b);
  }
  cropRatiosEl.style.display = crop.ratios.length > 1 ? "" : "none";
}
function cropEntry() { return crop.queue[crop.pos] || null; }
function cropSaveCurrent() {
  const e = cropEntry();
  if (!e || !crop.img) return;
  crop.states[e.oi] = { ratio: crop.ratio, z: crop.z, ox: crop.ox, oy: crop.oy };
}
function cropRestore(e) {
  crop.img = e.img;
  crop.iw = e.img.naturalWidth || e.img.width;
  crop.ih = e.img.naturalHeight || e.img.height;
  const o = crop.opts || {};
  const src = (Array.isArray(o.ratios) && o.ratios.length) ? o.ratios : [{ label: "1:1", value: 1 }];
  crop.ratios = src.map((r) => ({ label: r.label, value: (r.value == null || r.value === 0 || r.value === "orig") ? (crop.iw / crop.ih) : r.value }));
  const st = crop.states[e.oi];
  crop.ratio = st ? st.ratio : (o.aspect != null ? o.aspect : crop.ratios[0].value);
  cropSetFrame(true);
  if (st) {
    crop.z = st.z; crop.ox = st.ox; crop.oy = st.oy;
    cropClamp(); cropDraw();
    cropZoom.value = String(Math.round(crop.z * 100));
    if (typeof syncRangeFill === "function") syncRangeFill(cropZoom);
  }
  cropRenderRatios();
}
function cropUpdateChrome() {
  const n = crop.queue.length;
  const o = crop.opts || {};
  const title = o.title || "裁剪图片";
  $("cropTitle").textContent = crop.batch ? title + "（" + (crop.pos + 1) + "/" + n + "）" : title;
  const bar = $("cropBatch"); if (bar) bar.hidden = !crop.batch;
  const prev = $("cropPrev"); if (prev) prev.hidden = !crop.batch || crop.pos <= 0;
  const ok = $("cropOk");
  if (ok) ok.textContent = (crop.batch && crop.pos < n - 1) ? "裁剪并下一张" : "裁剪";
}
function cropEnter(pos) {
  crop.pos = Math.max(0, Math.min(crop.queue.length - 1, pos));
  const e = cropEntry();
  if (!e) { cropFinish(); return; }
  cropRestore(e);
  cropUpdateChrome();
  cropMask.classList.add("show");
}
function cropResultCurrent() {
  const out = cropExport();
  return { dataUrl: out.dataUrl, mime: out.mime, width: out.width, height: out.height };
}
function cropAutoCrop(e, ratio, relZoom) {
  const save = { img: crop.img, iw: crop.iw, ih: crop.ih, ratio: crop.ratio, frameW: crop.frameW, frameH: crop.frameH, base: crop.base, z: crop.z, ox: crop.ox, oy: crop.oy };
  crop.img = e.img;
  crop.iw = e.img.naturalWidth || e.img.width;
  crop.ih = e.img.naturalHeight || e.img.height;
  crop.ratio = ratio;
  cropSetFrame(true);
  cropSetZoom(relZoom);
  const out = cropExport();
  Object.assign(crop, save);
  cropRenderRatios();
  return { dataUrl: out.dataUrl, mime: out.mime, width: out.width, height: out.height };
}
function cropFinish() {
  const done = crop.done;
  const results = crop.results.slice();
  crop.done = null;
  crop.queue = []; crop.results = []; crop.states = []; crop.pos = 0;
  crop.img = null; crop.batch = false; crop.opts = null;
  cropMask.classList.remove("show");
  if (done) done(results);
}
function loadImageFile(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); showToast("图片解码失败：" + (file.name || ""), true); resolve(null); };
    img.src = url;
  });
}
async function cropBatch(files, opts) {
  const arr = Array.from(files || []);
  const results = new Array(arr.length).fill(null);
  const queue = [];
  if (arr.length > 1) showToast(typeof tf === "function" ? tf("正在加载 {0} 张图片…", arr.length) : ("正在加载 " + arr.length + " 张图片…"));
  for (let i = 0; i < arr.length; i++) {
    const img = await loadImageFile(arr[i]);
    if (img) queue.push({ img: img, oi: i, name: arr[i].name });
  }
  if (!queue.length) return results;
  return new Promise((resolve) => {
    crop.opts = opts || {};
    crop.outSize = crop.opts.outSize || 1024;
    crop.outMime = crop.opts.mime || "image/webp";
    crop.queue = queue;
    crop.results = results;
    crop.states = [];
    crop.batch = queue.length > 1;
    crop.done = resolve;
    crop.pos = 0;
    cropEnter(0);
  });
}
function cropExport() {
  const s = crop.base * crop.z;
  const sx = (0 - crop.ox) / s, sy = (0 - crop.oy) / s;
  const sw = crop.frameW / s, sh = crop.frameH / s;
  let ow = Math.max(1, Math.round(sw)), oh = Math.max(1, Math.round(sh));
  const k = Math.min(1, crop.outSize / Math.max(ow, oh));
  ow = Math.max(1, Math.round(ow * k));
  oh = Math.max(1, Math.round(oh * k));
  const out = document.createElement("canvas");
  out.width = ow; out.height = oh;
  out.getContext("2d").drawImage(crop.img, sx, sy, sw, sh, 0, 0, ow, oh);
  let dataUrl;
  try { dataUrl = out.toDataURL(crop.outMime, 0.9); }
  catch (e) { crop.outMime = "image/png"; dataUrl = out.toDataURL("image/png"); }
  return { dataUrl, mime: crop.outMime, width: ow, height: oh };
}
cropCanvas.addEventListener("pointerdown", (e) => {
  if (!crop.img) return;
  crop.dragging = true; crop.lastX = e.clientX; crop.lastY = e.clientY;
  try { cropCanvas.setPointerCapture(e.pointerId); } catch (_) {}
});
cropCanvas.addEventListener("pointermove", (e) => {
  if (!crop.dragging) return;
  const rect = cropCanvas.getBoundingClientRect();
  const kx = rect.width ? crop.frameW / rect.width : 1;
  const ky = rect.height ? crop.frameH / rect.height : 1;
  crop.ox += (e.clientX - crop.lastX) * kx;
  crop.oy += (e.clientY - crop.lastY) * ky;
  crop.lastX = e.clientX; crop.lastY = e.clientY;
  cropClamp(); cropDraw();
});
cropCanvas.addEventListener("pointerup", (e) => { crop.dragging = false; try { cropCanvas.releasePointerCapture(e.pointerId); } catch (_) {} });
cropCanvas.addEventListener("pointercancel", () => { crop.dragging = false; });
cropCanvas.addEventListener("wheel", (e) => { if (!crop.img) return; e.preventDefault(); cropSetZoom(crop.z * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });
cropZoom.addEventListener("input", () => { if (crop.img) cropSetZoom(parseInt(cropZoom.value, 10) / 100); });
$("cropOk").onclick = () => {
  const e = cropEntry();
  if (!e || !crop.img) return;
  crop.results[e.oi] = cropResultCurrent();
  cropSaveCurrent();
  if (crop.pos < crop.queue.length - 1) cropEnter(crop.pos + 1);
  else cropFinish();
};
$("cropCancel").onclick = () => cropFinish();
$("cropPrev").onclick = () => { if (crop.pos > 0) { cropSaveCurrent(); cropEnter(crop.pos - 1); } };
$("cropUseOriginal").onclick = () => {
  const e = cropEntry();
  if (!e) return;
  crop.results[e.oi] = { original: true };
  if (crop.pos < crop.queue.length - 1) cropEnter(crop.pos + 1);
  else cropFinish();
};
$("cropAllOriginal").onclick = () => {
  for (let i = crop.pos; i < crop.queue.length; i++) crop.results[crop.queue[i].oi] = { original: true };
  cropFinish();
};
$("cropApplyRest").onclick = () => {
  const e = cropEntry();
  if (!e) return;
  const ratio = crop.ratio, z = crop.z;
  crop.results[e.oi] = cropResultCurrent();
  cropSaveCurrent();
  for (let i = crop.pos + 1; i < crop.queue.length; i++) {
    crop.results[crop.queue[i].oi] = cropAutoCrop(crop.queue[i], ratio, z);
  }
  cropFinish();
};
cropMask.addEventListener("click", (e) => { if (e.target === cropMask) cropFinish(); });

function cropOutMime(type, fallback) {
  const t = String(type || "").toLowerCase();
  if (t === "image/png") return "image/png";
  if (t === "image/webp") return "image/webp";
  if (t === "image/jpeg" || t === "image/jpg") return "image/jpeg";
  return fallback || "image/webp";
}
async function cropImageFile(file, opts) {
  const results = await cropBatch([file], opts);
  const r = results && results[0];
  return (r && r.dataUrl) ? r : null;
}

/* ============ 外观：字体大小 / 助手文本居中 ============ */
const fsRange = $("fsRange");
const fsVal = $("fsVal");
const astCenterToggle = $("astCenterToggle");

function applyFontSize(v) {
  const size = Math.min(22, Math.max(12, parseInt(v, 10) || 15));
  document.documentElement.style.setProperty("--fs", size + "px");
  fsVal.textContent = size + "px";
  fsRange.value = size;
  localStorage.setItem("oc_font_size", String(size));
}
function applyAssistantCenter(on) {
  document.body.classList.toggle("ast-center", !!on);
  astCenterToggle.checked = !!on;
  localStorage.setItem("oc_ast_center", on ? "1" : "0");
}
fsRange.oninput = () => applyFontSize(fsRange.value);
astCenterToggle.onchange = () => applyAssistantCenter(astCenterToggle.checked);
applyFontSize(localStorage.getItem("oc_font_size") || 15);
applyAssistantCenter(localStorage.getItem("oc_ast_center") === "1");

/* ============ 面板透明度 / 控件透明 ============ */
const glassRange = $("glassRange");
const glassVal = $("glassVal");
const glassControlsToggle = $("glassControlsToggle");
function applyGlassAlpha(v) {
  const n = Math.min(100, Math.max(0, parseInt(v, 10)));
  const pct = isFinite(n) ? n : 100;
  document.documentElement.style.setProperty("--panel-alpha", String(pct / 100));
  try { localStorage.setItem("oc_panel_alpha", String(pct)); } catch (e) { /* ignore */ }
  if (glassVal) glassVal.textContent = pct + "%";
  if (glassRange) glassRange.value = String(pct);
}
function applyGlassControls(on) {
  document.body.classList.toggle("glass-controls", !!on);
  if (glassControlsToggle) glassControlsToggle.checked = !!on;
  try { localStorage.setItem("oc_glass_controls", on ? "1" : "0"); } catch (e) { /* ignore */ }
}
if (glassRange) glassRange.oninput = () => applyGlassAlpha(glassRange.value);
if (glassControlsToggle) glassControlsToggle.onchange = () => applyGlassControls(glassControlsToggle.checked);
applyGlassAlpha(localStorage.getItem("oc_panel_alpha") || 100);
applyGlassControls(localStorage.getItem("oc_glass_controls") === "1");

const imgCompressToggle = $("imgCompressToggle");
function applyImgCompress(on) {
  localStorage.setItem("oc_img_compress", on ? "1" : "0");
  imgCompressToggle.checked = !!on;
}
imgCompressToggle.onchange = () => applyImgCompress(imgCompressToggle.checked);
applyImgCompress(localStorage.getItem("oc_img_compress") !== "0");

const imgCropToggle = $("imgCropToggle");
function imgCropEnabled() {
  return localStorage.getItem("oc_img_crop") !== "0";
}
function applyImgCrop(on) {
  localStorage.setItem("oc_img_crop", on ? "1" : "0");
  imgCropToggle.checked = !!on;
}
imgCropToggle.onchange = () => applyImgCrop(imgCropToggle.checked);
applyImgCrop(localStorage.getItem("oc_img_crop") !== "0");

const currencySymbol = $("currencySymbol");
const fxRateInput = $("fxRate");
function applyCurrency() {
  const sym = (currencySymbol.value.trim() || "$").slice(0, 4);
  const rate = parseFloat(fxRateInput.value);
  localStorage.setItem("oc_currency", sym);
  localStorage.setItem("oc_fx_rate", isFinite(rate) && rate > 0 ? String(rate) : "1");
  for (const id in msgEls) {
    const e = msgEls[id];
    if (e && e.info) updateTokenBadge(e.info);
  }
  refreshSessionTokens();
}
if (currencySymbol && fxRateInput) {
  currencySymbol.value = localStorage.getItem("oc_currency") || "$";
  fxRateInput.value = localStorage.getItem("oc_fx_rate") || "1";
  currencySymbol.addEventListener("change", applyCurrency);
  fxRateInput.addEventListener("change", applyCurrency);
}

const moreToggle = $("moreToggle");
const moreBody = $("moreBody");
function applyMore(open) {
  if (!moreToggle || !moreBody) return;
  moreToggle.setAttribute("aria-expanded", open ? "true" : "false");
  moreBody.hidden = !open;
  localStorage.setItem("oc_settings_more", open ? "1" : "0");
}
if (moreToggle && moreBody) {
  moreToggle.onclick = () => applyMore(moreToggle.getAttribute("aria-expanded") !== "true");
  applyMore(localStorage.getItem("oc_settings_more") === "1");
}

