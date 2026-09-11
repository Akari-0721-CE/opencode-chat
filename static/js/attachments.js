/* ============ 附件 ============ */
const MAX_FILE = 20 * 1024 * 1024;
const IMG_MAX_SIDE = 1024;
let toastTimer = null;
function showToast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.classList.toggle("error", !!isError);
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

function fmtSize(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

function classify(mime) {
  mime = String(mime || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "text";
}

function currentModelRef() {
  const a = activeAssistant();
  if (a && a.model) return { providerID: a.model.providerID, modelID: a.model.id };
  return serverDefaultModel;
}

function findModel(ref) {
  if (!ref) return null;
  for (const prov of modelsByProvider) {
    if (prov.id !== ref.providerID) continue;
    for (const m of prov.models) if (m.id === ref.modelID) return m;
  }
  return null;
}

function variantsOf(model) {
  if (!model) return [];
  const m = findModel({ providerID: model.providerID, modelID: model.id || model.modelID });
  return (m && Array.isArray(m.variants)) ? m.variants : [];
}

function modelReasoning(model) {
  if (!model) return false;
  const m = findModel({ providerID: model.providerID, modelID: model.id || model.modelID });
  return !!(m && m.capabilities && m.capabilities.reasoning);
}

function fallbackModel() {
  if (serverDefaultModel) return { providerID: serverDefaultModel.providerID, id: serverDefaultModel.modelID };
  return null;
}

function effectiveModel() {
  const a = activeAssistant();
  return (a && a.model) ? a.model : fallbackModel();
}

function isCustomModel(ref) {
  if (!ref) return false;
  const list = localModels ? localModels[ref.providerID] : null;
  return Array.isArray(list) && list.indexOf(ref.modelID) >= 0;
}
function modelSupports(kind) {
  if (kind === "text") return true;
  const ref = currentModelRef();
  const m = findModel(ref);
  if (!m) return true;
  if (isCustomModel(ref)) return true; // 自定义模型能力未知，不拦截，交由服务端判断
  const cap = m.capabilities || {};
  if (cap.attachment === false) return false;
  const input = cap.input || {};
  if (input[kind] === false) return false;
  return true;
}

function unsupportedMsg(kind) {
  const m = findModel(currentModelRef());
  const name = m ? (m.name || m.id) : "当前模型";
  const label = { image: "图片", pdf: "PDF", audio: "音频", video: "视频" }[kind] || "该类型文件";
  return "模型「" + name + "」不支持" + label + "输入，请切换到支持的模型";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error("读取失败"));
    fr.readAsDataURL(file);
  });
}

function imgCompressEnabled() {
  return localStorage.getItem("oc_img_compress") !== "0";
}
function dataUrlSize(u) {
  const s = String(u || "");
  const i = s.indexOf(",");
  const b64 = i >= 0 ? s.slice(i + 1) : "";
  return Math.max(0, Math.round(b64.length * 3 / 4));
}
function compressImage(file, maxSide) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      if (scale >= 1) { resolve(null); return; }
      const nw = Math.max(1, Math.round(w * scale));
      const nh = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = nw;
      canvas.height = nh;
      canvas.getContext("2d").drawImage(img, 0, 0, nw, nh);
      const t = String(file.type || "").toLowerCase();
      const outMime = (t === "image/jpeg" || t === "image/jpg") ? "image/jpeg" : (t === "image/webp" ? "image/webp" : "image/png");
      let dataUrl;
      try {
        dataUrl = outMime === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.85) : canvas.toDataURL(outMime);
      } catch (e) {
        outMime = "image/png";
        dataUrl = canvas.toDataURL("image/png");
      }
      resolve({ dataUrl, mime: outMime, width: nw, height: nh });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片解码失败")); };
    img.src = url;
  });
}

function renderAttachments() {
  attachmentsEl.innerHTML = "";
  attachmentsEl.classList.toggle("has", attachments.length > 0);
  for (const at of attachments) {
    const chip = el("div", "attachment");
    if (at.kind === "image") {
      const img = document.createElement("img");
      img.src = at.dataUrl;
      chip.appendChild(img);
    } else {
      const ico = el("div", "file-ico");
      ico.appendChild(iconEl("file"));
      chip.appendChild(ico);
    }
    const meta = el("div", "a-meta");
    meta.appendChild(el("span", "a-name", at.name));
    meta.appendChild(el("span", "a-size", fmtSize(at.size)));
    chip.appendChild(meta);
    if (at.cropped) chip.appendChild(el("span", "a-badge", "已裁剪"));
    else if (at.compressed) chip.appendChild(el("span", "a-badge", "已压缩"));
    const rm = el("button", "a-remove", "×");
    rm.title = "移除";
    rm.onclick = () => { attachments = attachments.filter(x => x.id !== at.id); renderAttachments(); };
    chip.appendChild(rm);
    attachmentsEl.appendChild(chip);
  }
  updateSendState();
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  for (const file of files) {
    const kind = classify(file.type);
    if (!modelSupports(kind)) { showToast(unsupportedMsg(kind), true); continue; }
    if (file.size > MAX_FILE) { showToast("「" + file.name + "」超过 20 MB 限制", true); continue; }
    const t = String(file.type || "").toLowerCase();
    const isImg = kind === "image" && t !== "image/gif" && t !== "image/svg+xml";
    let dataUrl = "";
    let mime = file.type || "application/octet-stream";
    let size = file.size || 0;
    let compressed = false;
    let cropped = false;
    if (isImg && imgCropEnabled()) {
      const r = await cropImageFile(file, {
        outSize: IMG_MAX_SIDE,
        mime: cropOutMime(file.type, "image/jpeg"),
        title: "裁剪图片" + (file.name ? "：" + file.name : ""),
        ratios: [
          { label: "原始", value: "orig" },
          { label: "1:1", value: 1 },
          { label: "4:3", value: 4 / 3 },
          { label: "3:4", value: 3 / 4 },
          { label: "16:9", value: 16 / 9 },
          { label: "9:16", value: 9 / 16 },
        ],
      });
      if (!r) continue;
      dataUrl = r.dataUrl;
      mime = r.mime;
      size = dataUrlSize(r.dataUrl);
      cropped = true;
    } else if (isImg && imgCompressEnabled()) {
      try {
        const r = await compressImage(file, IMG_MAX_SIDE);
        if (r) { dataUrl = r.dataUrl; mime = r.mime; size = dataUrlSize(r.dataUrl); compressed = true; }
      } catch (e) { /* 压缩失败则回退原图 */ }
    }
    if (!dataUrl) {
      try { dataUrl = await fileToDataUrl(file); }
      catch (e) { showToast("读取「" + file.name + "」失败：" + e.message, true); continue; }
      mime = file.type || "application/octet-stream";
      size = file.size || 0;
      compressed = false;
    }
    attachments.push({
      id: uid("att"), name: file.name || ("file-" + Date.now()),
      mime, size, kind, dataUrl, compressed, cropped,
    });
  }
  renderAttachments();
}

function clearAttachments() {
  attachments = [];
  renderAttachments();
}

function updateSendState() {
  if (!currentSession) return;
  sendBtn.disabled = busy || (!input.value.trim() && !attachments.length);
}

attachBtn.onclick = () => fileInput.click();
fileInput.onchange = () => { addFiles(fileInput.files); fileInput.value = ""; };

const mainEl = document.querySelector(".main");
mainEl.addEventListener("dragover", (e) => {
  if (!currentSession) return;
  e.preventDefault();
  dropOverlay.classList.add("show");
});
mainEl.addEventListener("dragleave", (e) => {
  if (e.target === mainEl || !mainEl.contains(e.relatedTarget)) dropOverlay.classList.remove("show");
});
mainEl.addEventListener("drop", (e) => {
  if (!currentSession) return;
  e.preventDefault();
  dropOverlay.classList.remove("show");
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});
input.addEventListener("paste", (e) => {
  if (!currentSession || !e.clipboardData) return;
  const files = [];
  if (e.clipboardData.items) {
    for (const it of e.clipboardData.items) {
      if (it.kind === "file") { const f = it.getAsFile(); if (f) files.push(f); }
    }
  }
  if (!files.length && e.clipboardData.files) files.push(...e.clipboardData.files);
  if (files.length) { e.preventDefault(); addFiles(files); }
});
let draftTimer = null;
input.addEventListener("input", () => {
  updateSendState();
  const sid = currentSession && currentSession.id;
  const val = input.value;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { if (sid) saveDraft(sid, val); }, 300);
});
function flushDraft() {
  if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
  if (currentSession) saveDraft(currentSession.id, input.value);
}
window.addEventListener("beforeunload", flushDraft);
window.addEventListener("pagehide", flushDraft);

