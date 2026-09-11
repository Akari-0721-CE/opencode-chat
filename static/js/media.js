/* ============ 图片查看器 ============ */
const imgViewer = $("imgViewer");
const ivStage = $("ivStage");
const ivImg = $("ivImg");
let ivScale = 1, ivX = 0, ivY = 0;

function ivApply() { ivImg.style.transform = "translate(" + ivX + "px," + ivY + "px) scale(" + ivScale + ")"; }
function ivReset() { ivScale = 1; ivX = 0; ivY = 0; ivApply(); }
function ivZoomAt(factor, cx, cy) {
  const rect = ivStage.getBoundingClientRect();
  const px = cx - rect.left - rect.width / 2;
  const py = cy - rect.top - rect.height / 2;
  const prev = ivScale;
  const next = Math.min(16, Math.max(0.05, ivScale * factor));
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
function openImageViewer(src, name) {
  if (!src) return;
  ivImg.src = src;
  $("ivName").textContent = name || "";
  $("ivOpen").href = src;
  ivReset();
  imgViewer.classList.add("show");
}
function closeImageViewer() {
  imgViewer.classList.remove("show");
  ivStage.classList.remove("dragging");
  ivImg.removeAttribute("style");
  ivImg.src = "";
}
$("ivClose").onclick = closeImageViewer;
$("ivReset").onclick = ivReset;
$("ivZoomIn").onclick = () => ivZoomCenter(1.25);
$("ivZoomOut").onclick = () => ivZoomCenter(0.8);
let ivMoved = false;
imgViewer.addEventListener("click", (e) => {
  if ((e.target === imgViewer || e.target === ivStage) && !ivMoved) closeImageViewer();
});
ivStage.addEventListener("wheel", (e) => {
  e.preventDefault();
  ivZoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
}, { passive: false });
let ivDrag = null;
ivStage.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  ivMoved = false;
  ivDrag = { x: e.clientX, y: e.clientY, ox: ivX, oy: ivY };
  ivStage.classList.add("dragging");
  try { ivStage.setPointerCapture(e.pointerId); } catch (err) {}
});
ivStage.addEventListener("pointermove", (e) => {
  if (!ivDrag) return;
  const dx = e.clientX - ivDrag.x, dy = e.clientY - ivDrag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) ivMoved = true;
  ivX = ivDrag.ox + dx;
  ivY = ivDrag.oy + dy;
  ivApply();
});
function ivEndDrag() { ivDrag = null; ivStage.classList.remove("dragging"); }
ivStage.addEventListener("pointerup", ivEndDrag);
ivStage.addEventListener("pointercancel", ivEndDrag);
ivStage.addEventListener("dblclick", (e) => {
  if (ivScale > 1.01) ivReset();
  else ivZoomAt(2.5, e.clientX, e.clientY);
});
document.addEventListener("keydown", (e) => {
  if (!imgViewer.classList.contains("show")) return;
  if (e.key === "Escape") closeImageViewer();
  else if (e.key === "+" || e.key === "=") { e.preventDefault(); ivZoomCenter(1.25); }
  else if (e.key === "-") { e.preventDefault(); ivZoomCenter(0.8); }
  else if (e.key === "0") { e.preventDefault(); ivReset(); }
});
function handleImageClick(e) {
  const img = e.target && e.target.closest ? e.target.closest("img") : null;
  if (!img) return;
  if (img.closest(".msg-avatar, .avatar, .avatar-preview")) return;
  const src = img.currentSrc || img.src;
  if (!src) return;
  e.preventDefault();
  e.stopPropagation();
  openImageViewer(src, img.getAttribute("alt") || "");
}
messagesEl.addEventListener("click", handleImageClick, true);
attachmentsEl.addEventListener("click", handleImageClick, true);

/* ============ 背景 ============ */
const bgLayer = $("bgLayer");
const bgOverlay = $("bgOverlay");
const dimRange = $("dimRange");
const dimVal = $("dimVal");

function applyOverlay() {
  const dim = parseInt(dimRange.value, 10) / 100;
  bgOverlay.style.background = "rgba(0,0,0," + (dim * 0.9).toFixed(2) + ")";
  dimVal.textContent = dimRange.value + "%";
  localStorage.setItem("oc_bg_dim", dimRange.value);
}
function setBgImage(dataUrl) {
  bgLayer.style.backgroundImage = 'url("' + dataUrl + '")';
  localStorage.setItem("oc_bg", dataUrl);
}
function loadBg() {
  const data = localStorage.getItem("oc_bg");
  if (data) bgLayer.style.backgroundImage = 'url("' + data + '")';
  const dim = localStorage.getItem("oc_bg_dim");
  if (dim !== null) dimRange.value = dim;
  applyOverlay();
}
$("bgClear").onclick = () => {
  bgLayer.style.backgroundImage = "";
  localStorage.removeItem("oc_bg");
};
$("bgBtn").onclick = () => {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*";
  inp.onchange = () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
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
      setBgImage(canvas.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  inp.click();
};
dimRange.oninput = applyOverlay;

/* ============ 图片裁剪 ============ */
const cropCanvas = $("cropCanvas");
const cropCtx = cropCanvas.getContext("2d");
const cropZoom = $("cropZoom");
const cropRatiosEl = $("cropRatios");
const cropMask = $("cropMask");
const CROP_STAGE = 300;
const crop = { img: null, iw: 0, ih: 0, frameW: 0, frameH: 0, base: 1, z: 1, ox: 0, oy: 0, ratio: 1, done: null, dragging: false, lastX: 0, lastY: 0, ratios: [], outSize: 1024, outMime: "image/webp" };

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
function cropClose(result) {
  cropMask.classList.remove("show");
  const d = crop.done;
  crop.done = null;
  crop.img = null;
  if (d) d(result);
}
function openCropper(img, opts, done) {
  crop.img = img;
  crop.iw = img.naturalWidth || img.width;
  crop.ih = img.naturalHeight || img.height;
  crop.outSize = opts.outSize || 1024;
  crop.outMime = opts.mime || "image/webp";
  const src = (Array.isArray(opts.ratios) && opts.ratios.length) ? opts.ratios : [{ label: "1:1", value: 1 }];
  crop.ratios = src.map((r) => ({ label: r.label, value: (r.value == null || r.value === 0 || r.value === "orig") ? (crop.iw / crop.ih) : r.value }));
  crop.ratio = opts.aspect != null ? opts.aspect : crop.ratios[0].value;
  crop.done = done;
  $("cropTitle").textContent = opts.title || "裁剪图片";
  cropRenderRatios();
  cropSetFrame(true);
  cropMask.classList.add("show");
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
$("cropOk").onclick = () => { if (crop.img) cropClose(cropExport()); };
$("cropCancel").onclick = () => cropClose(null);
cropMask.addEventListener("click", (e) => { if (e.target === cropMask) cropClose(null); });

function cropOutMime(type, fallback) {
  const t = String(type || "").toLowerCase();
  if (t === "image/png") return "image/png";
  if (t === "image/webp") return "image/webp";
  if (t === "image/jpeg" || t === "image/jpg") return "image/jpeg";
  return fallback || "image/webp";
}
function cropImageFile(file, opts) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); openCropper(img, opts || {}, resolve); };
    img.onerror = () => { URL.revokeObjectURL(url); showToast("图片解码失败", true); resolve(null); };
    img.src = url;
  });
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

