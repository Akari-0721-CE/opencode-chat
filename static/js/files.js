/* ============ 电脑文件浏览 / 预览 / 复用 ============ */
/* 经代理放行的 opencode `/file`（列目录）与 `/file/content`（读内容）浏览电脑文件。
   起点默认是当前助手的工作区，方便复用助手产出的成果（预览 / 引用 / 添加到对话 / 保存到手机）。 */

const FILE_EXT_MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  bmp: "image/bmp", ico: "image/x-icon", svg: "image/svg+xml", avif: "image/avif",
  pdf: "application/pdf", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
  txt: "text/plain", md: "text/markdown", json: "application/json", js: "text/javascript",
  ts: "text/typescript", tsx: "text/tsx", jsx: "text/jsx", css: "text/css", html: "text/html",
  htm: "text/html", xml: "text/xml", yml: "text/yaml", yaml: "text/yaml", csv: "text/csv",
  log: "text/plain", ini: "text/plain", toml: "text/plain", py: "text/x-python", sh: "text/x-sh",
  bat: "text/plain", ps1: "text/plain", c: "text/x-c", h: "text/x-c", cpp: "text/x-c++",
  go: "text/x-go", rs: "text/x-rust", rb: "text/x-ruby", php: "text/x-php", java: "text/x-java",
  sql: "text/plain", vue: "text/plain", svelte: "text/plain", env: "text/plain",
};

function fileExt(name) {
  const s = String(name || "");
  const i = s.lastIndexOf(".");
  return i >= 0 ? s.slice(i + 1).toLowerCase() : "";
}
function fileMime(name) {
  return FILE_EXT_MIME[fileExt(name)] || "application/octet-stream";
}
function isImageName(name) {
  return /^(png|jpe?g|gif|webp|bmp|ico|svg|avif)$/.test(fileExt(name));
}

const FILE_FAV_KEY = "oc_file_favs";
let filesDir = "";
let filesHome = "";
let fileViewData = null;
let fileDrives = null;

function favLabel(path) {
  const s = String(path || "").replace(/[\\/]+$/, "");
  const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  return i >= 0 ? (s.slice(i + 1) || s) : s;
}
function fileFavs() {
  try { const a = JSON.parse(localStorage.getItem(FILE_FAV_KEY) || "[]"); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function saveFileFavs(a) {
  try { localStorage.setItem(FILE_FAV_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ }
}
function isFavDir(dir) {
  const k = typeof normDir === "function" ? normDir(dir) : String(dir).toLowerCase();
  return fileFavs().some((f) => (typeof normDir === "function" ? normDir(f.path) : String(f.path).toLowerCase()) === k);
}
function toggleFavDir(dir) {
  if (!dir) return;
  const k = typeof normDir === "function" ? normDir(dir) : String(dir).toLowerCase();
  const norm = (p) => (typeof normDir === "function" ? normDir(p) : String(p).toLowerCase());
  let list = fileFavs();
  if (list.some((f) => norm(f.path) === k)) {
    list = list.filter((f) => norm(f.path) !== k);
    showToast("已取消收藏");
  } else {
    list.unshift({ path: dir, name: favLabel(dir), at: Date.now() });
    if (list.length > 20) list = list.slice(0, 20);
    showToast("已收藏该文件夹");
  }
  saveFileFavs(list);
  renderFilesChrome();
  if (typeof saveProfile === "function") saveProfile();
}
function removeFavDir(path) {
  const k = typeof normDir === "function" ? normDir(path) : String(path).toLowerCase();
  const norm = (p) => (typeof normDir === "function" ? normDir(p) : String(p).toLowerCase());
  saveFileFavs(fileFavs().filter((f) => norm(f.path) !== k));
  renderFilesChrome();
  if (typeof saveProfile === "function") saveProfile();
}
async function loadDrives(force) {
  if (fileDrives && !force) return fileDrives;
  try {
    const r = await api("/_drives", { noDir: true });
    fileDrives = (r && Array.isArray(r.drives)) ? r.drives : [];
  } catch (e) { fileDrives = []; }
  return fileDrives;
}

function renderFilesChrome() {
  const dEl = $("filesDrives");
  if (dEl) {
    dEl.innerHTML = "";
    const curDrive = (String(filesDir || "").match(/^([A-Za-z]):/) || [])[1];
    if (fileDrives && fileDrives.length) dEl.appendChild(el("span", "files-chip-label", "磁盘"));
    for (const d of (fileDrives || [])) {
      const letter = d.replace(":", "");
      const b = el("button", "files-chip" + (letter.toLowerCase() === String(curDrive || "").toLowerCase() ? " on" : ""), d);
      b.type = "button";
      b.onclick = () => filesLoad(letter + ":\\");
      dEl.appendChild(b);
    }
  }
  const fEl = $("filesFavs");
  if (fEl) {
    fEl.innerHTML = "";
    const star = $("filesFav");
    if (star) {
      const on = isFavDir(filesDir);
      star.classList.toggle("fav-on", on);
      star.title = on ? "取消收藏此文件夹" : "收藏此文件夹";
    }
    const list = fileFavs();
    if (!list.length) { fEl.style.display = "none"; return; }
    fEl.style.display = "";
    fEl.appendChild(el("span", "files-chip-label", "常用"));
    for (const f of list) {
      const wrap = el("span", "files-fav");
      const b = el("button", "files-chip", f.name || favLabel(f.path));
      b.type = "button";
      b.title = f.path;
      b.onclick = () => filesLoad(f.path);
      wrap.appendChild(b);
      const x = el("button", "files-fav-del", "×");
      x.type = "button";
      x.title = "移除";
      x.onclick = (e) => { if (e.stopPropagation) e.stopPropagation(); removeFavDir(f.path); };
      wrap.appendChild(x);
      fEl.appendChild(wrap);
    }
  }
}

function filesDefaultDir() {
  const a = (typeof activeAssistant === "function") ? activeAssistant() : null;
  return (a && a.directory) ? a.directory : (homeDir || "");
}

async function openFilesBrowser(startAt) {
  const mask = $("filesMask");
  if (!mask) return;
  if (!filesHome) filesHome = filesDefaultDir();
  let at = startAt || filesDir || filesDefaultDir();
  if (!at) {
    try { const p = await api("/path", { noDir: true }); at = p.home || p.directory || ""; } catch (e) { at = ""; }
  }
  if (!at) at = "C:\\";
  mask.classList.add("show");
  await loadDrives();
  await filesLoad(at);
}

async function filesLoad(dir) {
  filesDir = dir;
  const listEl = $("filesList");
  const pathEl = $("filesPath");
  if (!listEl) return;
  if (pathEl) pathEl.textContent = dir;
  renderFilesChrome();
  listEl.innerHTML = '<div class="dir-empty">加载中…</div>';
  let entries = [];
  try {
    entries = await api("/file?path=" + encodeURIComponent(dir), { directory: dir });
  } catch (e) {
    listEl.innerHTML = "";
    listEl.appendChild(el("div", "dir-empty", "无法读取该目录：" + e.message));
    return;
  }
  entries = Array.isArray(entries) ? entries : [];
  const dirs = entries.filter(x => x.type === "directory").sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const files = entries.filter(x => x.type !== "directory").sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  listEl.innerHTML = "";

  const up = el("div", "file-row files-up");
  const upIco = el("span", "file-row-ico");
  upIco.appendChild(iconEl("up"));
  up.appendChild(upIco);
  up.appendChild(el("span", "dir-label", "..（上级目录）"));
  up.onclick = () => filesLoad(parentPath(filesDir));
  listEl.appendChild(up);

  if (!dirs.length && !files.length) {
    listEl.appendChild(el("div", "dir-empty", "（空目录）"));
    return;
  }
  for (const d of dirs) {
    const row = el("div", "file-row");
    const ico = el("span", "file-row-ico folder");
    ico.appendChild(iconEl("folder"));
    row.appendChild(ico);
    row.appendChild(el("span", "dir-label", d.name));
    row.onclick = () => filesLoad(d.absolute || d.path);
    listEl.appendChild(row);
  }
  for (const f of files) {
    const row = el("div", "file-row");
    const ico = el("span", "file-row-ico");
    ico.appendChild(iconEl("file"));
    row.appendChild(ico);
    row.appendChild(el("span", "dir-label", f.name));
    if (isImageName(f.name)) row.appendChild(el("span", "file-tag", "图片"));
    row.onclick = () => fileAction(f);
    listEl.appendChild(row);
  }
}

function fileAbsolute(f) {
  if (f && f.absolute) return f.absolute;
  const base = String(filesDir || "").replace(/[\\/]+$/, "");
  return base ? (base + "\\" + f.name) : f.name;
}

async function fetchFileContent(abs) {
  let r;
  try {
    r = await api("/file/content?path=" + encodeURIComponent(abs), { directory: filesDir });
  } catch (e) {
    if (/->\s*404|\b404\b/.test(String(e.message || ""))) {
      throw new Error("服务端未启用文件读取（/file/content），请重启本程序前端后重试");
    }
    throw e;
  }
  return (r && r.content != null) ? { type: r.type || "text", content: r.content } : null;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function textToBase64(text) {
  return btoa(unescape(encodeURIComponent(String(text || ""))));
}

function fileAction(f) {
  const img = isImageName(f.name);
  const opts = [
    { label: "预览 / 查看内容", value: "preview" },
    { label: "添加到对话（作为附件）", value: "attach" },
    { label: "插入路径到输入框", value: "insert" },
    { label: "复制完整路径", value: "copy" },
  ];
  if (typeof isAndroidApp === "function" && isAndroidApp()) opts.push({ label: "保存 / 分享到手机", value: "save" });
  if (typeof openChoice === "function") {
    openChoice(f.name, opts, (v) => {
      if (v === "preview") previewFile(f, img);
      else if (v === "attach") attachFile(f);
      else if (v === "insert") insertFilePath(fileAbsolute(f));
      else if (v === "copy") copyFilePath(fileAbsolute(f));
      else if (v === "save") saveFileToPhone(f);
    });
  }
}

async function previewFile(f, isImg) {
  const abs = fileAbsolute(f);
  try {
    const r = await fetchFileContent(abs);
    if (!r) { showToast("无法读取文件", true); return; }
    const mime = fileMime(f.name);
    if (isImg || (r.type === "binary" && /^image\//.test(mime))) {
      const dataUrl = "data:" + mime + ";base64," + r.content;
      if (typeof openImageViewer === "function") openImageViewer(dataUrl, f.name);
      return;
    }
    if (r.type === "text") { openFileViewer(f.name, r.content); return; }
    showToast("该文件不是文本 / 图片，可「添加到对话」或保存到手机", true);
  } catch (e) {
    showToast("预览失败：" + e.message, true);
  }
}

async function fileToFileObject(f) {
  const r = await fetchFileContent(fileAbsolute(f));
  if (!r) throw new Error("无法读取文件");
  const mime = fileMime(f.name);
  let blob;
  if (r.type === "binary") blob = new Blob([base64ToBytes(r.content)], { type: mime });
  else blob = new Blob([String(r.content)], { type: mime.startsWith("text") ? mime : "text/plain" });
  return new File([blob], f.name, { type: blob.type });
}

async function attachFile(f) {
  try {
    const file = await fileToFileObject(f);
    if (typeof addFiles === "function") addFiles([file]);
    const mask = $("filesMask");
    if (mask) mask.classList.remove("show");
    showToast("已添加到对话");
  } catch (e) {
    showToast("添加失败：" + e.message, true);
  }
}

function insertFilePath(abs) {
  if (typeof input === "undefined" || !input) return;
  const cur = input.value || "";
  input.value = cur.replace(/\s*$/, "") ? (cur.replace(/\s*$/, "") + " " + abs) : abs;
  try { input.dispatchEvent(new Event("input")); } catch (e) { /* ignore */ }
  const mask = $("filesMask");
  if (mask) mask.classList.remove("show");
  try { input.focus(); } catch (e) { /* ignore */ }
}

async function copyText(text) {
  const s = String(text == null ? "" : text);
  if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(s); return; }
  const ta = document.createElement("textarea");
  ta.value = s;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}
async function copyFilePath(abs) {
  try { await copyText(abs); showToast("已复制路径"); }
  catch (e) { showToast("复制失败", true); }
}

async function saveFileToPhone(f) {
  try {
    const r = await fetchFileContent(fileAbsolute(f));
    if (!r) { showToast("无法读取文件", true); return; }
    const mime = fileMime(f.name);
    const dataUrl = (r.type === "binary")
      ? ("data:" + mime + ";base64," + r.content)
      : ("data:" + (mime.startsWith("text") ? mime : "text/plain") + ";base64," + textToBase64(r.content));
    const n = (typeof ocNative === "function") ? ocNative() : null;
    if (n && n.saveDataUrl) n.saveDataUrl(f.name, mime, dataUrl);
    else showToast("当前环境不支持保存到手机", true);
  } catch (e) {
    showToast("保存失败：" + e.message, true);
  }
}

function openFileViewer(name, content) {
  fileViewData = { name: name, content: String(content == null ? "" : content) };
  const title = $("fileViewName");
  if (title) title.textContent = name;
  const body = $("fileViewBody");
  if (body) body.textContent = fileViewData.content.slice(0, 300000);
  const mask = $("fileViewMask");
  if (mask) mask.classList.add("show");
}

if ($("filesBtn")) $("filesBtn").onclick = () => openFilesBrowser();
if ($("filesFav")) $("filesFav").onclick = () => { if (filesDir) toggleFavDir(filesDir); };
if ($("filesRefresh")) $("filesRefresh").onclick = async () => { await loadDrives(true); if (filesDir) filesLoad(filesDir); else renderFilesChrome(); };
if ($("filesClose")) $("filesClose").onclick = () => $("filesMask").classList.remove("show");
if ($("filesMask")) $("filesMask").addEventListener("click", (e) => { if (e.target === $("filesMask")) $("filesMask").classList.remove("show"); });
if ($("fileViewClose")) $("fileViewClose").onclick = () => $("fileViewMask").classList.remove("show");
if ($("fileViewMask")) $("fileViewMask").addEventListener("click", (e) => { if (e.target === $("fileViewMask")) $("fileViewMask").classList.remove("show"); });
if ($("fileViewCopy")) $("fileViewCopy").onclick = () => {
  if (!fileViewData) return;
  copyText(fileViewData.content).then(() => showToast("已复制")).catch(() => showToast("复制失败", true));
};
if ($("fileViewAdd")) $("fileViewAdd").onclick = async () => {
  if (!fileViewData) return;
  try {
    const mime = fileMime(fileViewData.name);
    const blob = new Blob([fileViewData.content], { type: mime.startsWith("text") ? mime : "text/plain" });
    const file = new File([blob], fileViewData.name, { type: blob.type });
    if (typeof addFiles === "function") addFiles([file]);
    $("fileViewMask").classList.remove("show");
    $("filesMask").classList.remove("show");
    showToast("已添加到对话");
  } catch (e) { showToast("添加失败：" + e.message, true); }
};
