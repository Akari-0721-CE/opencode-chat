/* ============ 本地模型（llama.cpp / GGUF） ============ */
/* 纯函数（供单测，注意与 server.py 的 gguf_alias 保持一致） */
function ggufAlias(path) {
  let name = String(path || "").replace(/\\/g, "/");
  name = name.slice(name.lastIndexOf("/") + 1);
  if (/\.gguf$/i.test(name)) name = name.slice(0, -5);
  name = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-._]+|[-._]+$/g, "");
  return name.slice(0, 64) || "local-model";
}
function localRuntimeLabel(rt) {
  if (!rt || !rt.installed) return "未安装";
  const base = rt.variant === "cuda" ? "CUDA" : (rt.variant === "cpu" ? "CPU" : "已安装");
  return base + (rt.tag ? " · " + rt.tag : "");
}
function localProgressText(inst) {
  if (!inst) return "";
  if (inst.installing) {
    if (inst.state === "downloading") {
      const mb = Math.round((inst.received || 0) / 1048576);
      const seq = inst.count > 1 ? "（" + (inst.index || 1) + "/" + inst.count + "）" : "";
      if (inst.total) return "正在下载运行时" + seq + "… " + Math.round(((inst.received || 0) / inst.total) * 100) + "%";
      return "正在下载运行时" + seq + "… " + mb + " MB";
    }
    if (inst.state === "extracting") return "正在解压运行时…";
    return "正在准备运行时…";
  }
  if (inst.state === "ready") return "运行时就绪" + (inst.variant ? "（" + inst.variant + "）" : "");
  if (inst.state === "error") return "安装失败：" + (inst.error || "未知错误");
  return "";
}

async function localFetch(path, opts) {
  const init = { method: (opts && opts.method) || "GET" };
  if (opts && opts.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch("/api" + path, init);
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || ("HTTP " + res.status);
    throw new Error(msg);
  }
  return data;
}

let localPoll = null;
let localLastStatus = null;

function renderLocalStatus(st) {
  const box = $("localStatus");
  if (!box || !st) return;
  const rt = st.runtime || {};
  const parts = [];
  parts.push("运行环境：" + localRuntimeLabel(rt));
  parts.push("服务：" + (st.running ? "运行中" : (st.starting ? "启动中…" : "未运行")));
  if (st.nvidia) parts.push("检测到 NVIDIA 显卡");
  box.textContent = parts.join("　·　");
  box.title = rt.path || rt.installDir || "";
}

function renderLocalProgress(inst) {
  const box = $("localProgress");
  if (!box) return;
  box.textContent = localProgressText(inst);
}

function applyLocalConfig(cfg) {
  cfg = cfg || {};
  if ($("localEnabled")) $("localEnabled").checked = !!cfg.enabled;
  if ($("localRuntime")) $("localRuntime").value = cfg.runtime || "auto";
  if ($("localModel")) $("localModel").value = cfg.modelPath || "";
  if ($("localName")) $("localName").value = cfg.modelName || "";
  if ($("localPort")) $("localPort").value = cfg.port || 8686;
  if ($("localCtx")) $("localCtx").value = cfg.ctx || 8192;
  if ($("localNgl")) $("localNgl").value = (cfg.gpuLayers === undefined ? -1 : cfg.gpuLayers);
  if ($("localThreads")) $("localThreads").value = cfg.threads || 0;
  if ($("localJinja")) $("localJinja").checked = cfg.jinja !== false;
  if ($("localExtra")) $("localExtra").value = cfg.extraArgs || "";
}

function collectLocalForm() {
  const intVal = (v, dflt) => {
    const n = parseInt(v, 10);
    return isFinite(n) ? n : dflt;
  };
  return {
    enabled: !!($("localEnabled") && $("localEnabled").checked),
    runtime: ($("localRuntime") && $("localRuntime").value) || "auto",
    modelPath: (($("localModel") && $("localModel").value) || "").trim(),
    modelName: (($("localName") && $("localName").value) || "").trim(),
    port: intVal($("localPort") && $("localPort").value, 8686),
    ctx: intVal($("localCtx") && $("localCtx").value, 8192),
    gpuLayers: intVal($("localNgl") && $("localNgl").value, -1),
    threads: intVal($("localThreads") && $("localThreads").value, 0),
    jinja: !!($("localJinja") && $("localJinja").checked),
    extraArgs: (($("localExtra") && $("localExtra").value) || "").trim(),
  };
}

async function refreshLocal(fillForm) {
  let st;
  try { st = await localFetch("/_local"); }
  catch (e) {
    if ($("localStatus")) $("localStatus").textContent = "读取失败：" + e.message;
    return;
  }
  localLastStatus = st;
  renderLocalStatus(st);
  renderLocalProgress(st.install || {});
  if (fillForm) applyLocalConfig(st.config || {});
}

function startLocalPoll() {
  if (localPoll) return;
  localPoll = setInterval(async () => {
    const mask = $("localMask");
    if (!mask || !mask.classList.contains("show")) { stopLocalPoll(); return; }
    await refreshLocal(false);
  }, 1500);
}
function stopLocalPoll() {
  if (localPoll) { clearInterval(localPoll); localPoll = null; }
}

async function saveLocalConfig() {
  return localFetch("/_local", { method: "POST", body: collectLocalForm() });
}

function renderLocalFiles(files) {
  const box = $("localFiles");
  if (!box) return;
  box.innerHTML = "";
  if (!files || !files.length) {
    box.appendChild(el("div", "hint", "该文件夹（含一级子目录）内没有 .gguf 文件"));
    return;
  }
  for (const f of files) {
    const b = el("button", "local-file");
    b.type = "button";
    b.appendChild(el("span", "local-file-name", f.name));
    const size = (typeof fmtSize === "function") ? fmtSize(f.size) : ((f.size / 1048576).toFixed(1) + " MB");
    b.appendChild(el("span", "local-file-size", size));
    b.title = f.path;
    b.onclick = () => {
      if ($("localModel")) $("localModel").value = f.path;
      if ($("localName") && !$("localName").value.trim()) $("localName").value = ggufAlias(f.path);
    };
    box.appendChild(b);
  }
}

async function scanLocalDir(dir) {
  const box = $("localFiles");
  if (box) box.innerHTML = '<div class="hint">扫描中…</div>';
  try {
    const r = await localFetch("/_local/scan", { method: "POST", body: { dir: dir } });
    renderLocalFiles(r.files || []);
  } catch (e) {
    if (box) box.innerHTML = '<div class="hint">' + escapeHtml(e.message) + "</div>";
  }
}

async function openLocal() {
  if (typeof isRemote === "function" && isRemote()) {
    showToast("远程模式下不可管理本地模型", true);
    return;
  }
  $("localMask").classList.add("show");
  if ($("localFiles")) $("localFiles").innerHTML = "";
  await refreshLocal(true);
  startLocalPoll();
}

if ($("localOpen")) $("localOpen").onclick = openLocal;
if ($("localClose")) $("localClose").onclick = () => { $("localMask").classList.remove("show"); stopLocalPoll(); };
if ($("localMask")) $("localMask").addEventListener("click", (e) => { if (e.target === $("localMask")) $("localClose").click(); });
if ($("localRefresh")) $("localRefresh").onclick = () => refreshLocal(true);

if ($("localSave")) $("localSave").onclick = async () => {
  try {
    await saveLocalConfig();
    showToast("已保存本地模型设置");
    await refreshLocal(true);
  } catch (e) { showToast("保存失败：" + e.message, true); }
};

if ($("localInstall")) $("localInstall").onclick = async () => {
  const variant = ($("localRuntime") && $("localRuntime").value) || "auto";
  const hasNv = !!(localLastStatus && localLastStatus.nvidia);
  if (!$("localInstall").dataset.busy) {
    $("localInstall").dataset.busy = "1";
    try {
      await saveLocalConfig();
      const r = await localFetch("/_local/install", { method: "POST", body: { variant: variant } });
      if (r && r.variant === "cuda" && !hasNv) {
        showToast("未检测到 NVIDIA 显卡，将尝试 CUDA 构建（可能无法启动）", true);
      }
      showToast("已开始下载 llama.cpp 运行时…");
    } catch (e) {
      showToast("安装失败：" + e.message, true);
    } finally {
      delete $("localInstall").dataset.busy;
    }
  }
  await refreshLocal(true);
  startLocalPoll();
};

if ($("localStart")) $("localStart").onclick = async () => {
  try {
    await saveLocalConfig();
    const r = await localFetch("/_local/start", { method: "POST", body: {} });
    showToast(r && r.already ? "本地服务已在运行" : "正在启动本地服务，首次加载模型可能需要一会儿…");
    await refreshLocal(true);
    startLocalPoll();
    setTimeout(() => { if (typeof refreshAfterConnect === "function") refreshAfterConnect(); }, 3000);
  } catch (e) { showToast("启动失败：" + e.message, true); }
};

if ($("localStop")) $("localStop").onclick = async () => {
  try {
    await localFetch("/_local/stop", { method: "POST", body: {} });
    showToast("已停止本地服务");
  } catch (e) { showToast("停止失败：" + e.message, true); }
  await refreshLocal(false);
};

if ($("localBrowse")) $("localBrowse").onclick = () => {
  const cur = (($("localModel") && $("localModel").value) || "").trim();
  const start = cur ? cur.replace(/[\\/][^\\/]*$/, "") : null;
  if (typeof openDirBrowser === "function") {
    openDirBrowser(start, { title: "选择模型所在文件夹", onChoose: (d) => scanLocalDir(d) });
  }
};
