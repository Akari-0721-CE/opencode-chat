/* ============ 工具超时（bash） ============ */
const bashTimeoutRange = $("bashTimeoutRange");
const bashTimeoutVal = $("bashTimeoutVal");
function bashTimeoutMs() {
  const sec = parseInt(localStorage.getItem("oc_bash_timeout") || "0", 10);
  return (isFinite(sec) && sec > 0) ? Math.min(600, sec) * 1000 : 0;
}
function applyBashTimeout(v) {
  const sec = Math.min(600, Math.max(0, parseInt(v, 10) || 0));
  bashTimeoutRange.value = sec;
  bashTimeoutVal.textContent = sec ? sec + "s" : "默认";
  localStorage.setItem("oc_bash_timeout", String(sec));
}
bashTimeoutRange.oninput = () => applyBashTimeout(bashTimeoutRange.value);
applyBashTimeout(localStorage.getItem("oc_bash_timeout") || 60);

/* ============ 模型 / Agent 加载 ============ */
async function loadModels() {
  try {
    const cfg = await api("/config/providers", { noDir: true });
    const providers = [];
    for (const prov of (cfg.providers || [])) {
      const models = [];
      for (const mid of Object.keys(prov.models || {})) {
        const m = prov.models[mid];
        models.push({
          id: m.id || mid,
          providerID: m.providerID || prov.id,
          name: m.name || mid,
          capabilities: m.capabilities || {},
          variants: m.variants ? Object.keys(m.variants) : [],
          limit: m.limit || null,
        });
      }
      providers.push({ id: prov.id, name: prov.name || prov.id, models });
    }
    modelsByProvider = providers;
    const defaults = cfg.default || {};
    serverDefaultModel = null;
    for (const prov of providers) {
      if (defaults[prov.id]) { serverDefaultModel = { providerID: prov.id, modelID: defaults[prov.id] }; break; }
    }
    if (!serverDefaultModel && providers.length && providers[0].models.length) {
      serverDefaultModel = { providerID: providers[0].id, modelID: providers[0].models[0].id };
    }
    modelSelect.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = "（默认模型）";
    modelSelect.appendChild(def);
    for (const prov of providers) {
      const grp = document.createElement("optgroup");
      grp.label = prov.name || prov.id;
      for (const m of prov.models) {
        const opt = document.createElement("option");
        opt.value = modelKey(m.providerID, m.id);
        opt.textContent = m.name || m.id;
        grp.appendChild(opt);
      }
      modelSelect.appendChild(grp);
    }
  } catch (e) {
    console.error(e);
  }
}
async function loadAgents() {
  try {
    const list = await api("/agent", { noDir: true });
    agentsCache = (Array.isArray(list) ? list : []).filter(a => a.mode === "primary");
  } catch (e) {
    console.error(e);
    agentsCache = [];
  }
}
async function loadTools() {
  try {
    const ids = await api("/experimental/tool/ids", { noDir: true });
    allToolIds = (Array.isArray(ids) ? ids : []).filter(id => id && id !== "invalid");
  } catch (e) {
    console.error(e);
    allToolIds = ["bash", "read", "glob", "grep", "edit", "write", "task", "webfetch", "todowrite", "websearch", "skill", "apply_patch"];
  }
}

function updateModelSelect() {
  const a = activeAssistant();
  if (!a) { modelSelect.value = ""; updateVariantSelect(); return; }
  if (a.model) modelSelect.value = modelKey(a.model.providerID, a.model.id);
  else modelSelect.value = "";
  updateVariantSelect();
  updateCtxRing();
}

function fillVariantOptions(sel, variants, selected, withNone) {
  sel.innerHTML = "";
  const def = document.createElement("option");
  def.value = "";
  def.textContent = (variants.length || withNone) ? "思考强度：默认" : "思考强度：不支持";
  sel.appendChild(def);
  for (const v of variants) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = "思考强度：" + v;
    sel.appendChild(o);
  }
  if (withNone && variants.indexOf("none") < 0) {
    const o = document.createElement("option");
    o.value = "none";
    o.textContent = "思考强度：非思考";
    sel.appendChild(o);
  }
  sel.value = (selected && (variants.indexOf(selected) >= 0 || (withNone && selected === "none"))) ? selected : "";
}

function updateVariantSelect() {
  const a = activeAssistant();
  const ref = effectiveModel();
  const variants = variantsOf(ref);
  const withNone = modelReasoning(ref) || variants.indexOf("none") >= 0;
  const show = variants.length > 0 || withNone;
  variantSelect.hidden = !show;
  variantSelect.disabled = !show;
  fillVariantOptions(variantSelect, variants, a ? a.variant : "", withNone);
}

modelSelect.onchange = () => {
  const a = activeAssistant();
  if (!a) return;
  const val = modelSelect.value;
  if (!val) { a.model = null; }
  else {
    a.model = parseModelKey(val);
  }
  if (a.variant) {
    const vs = variantsOf(effectiveModel());
    if (a.variant === "none") { if (!modelReasoning(effectiveModel()) && vs.indexOf("none") < 0) a.variant = null; }
    else if (vs.indexOf(a.variant) < 0) a.variant = null;
  }
  saveStore();
  defaultModel = a.model;
  if (a.model) localStorage.setItem("oc_model", JSON.stringify(a.model));
  updateVariantSelect();
};
variantSelect.onchange = () => {
  const a = activeAssistant();
  if (!a) return;
  a.variant = variantSelect.value || null;
  saveStore();
};

/* ============ 目录浏览器 ============ */
let dirCurrent = "";
let dirHome = "";
function parentPath(p) {
  p = String(p).replace(/[\\/]+$/, "");
  const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  if (i < 0) return p;
  if (i <= 2 && /^[A-Za-z]:$/.test(p.slice(0, i + 1))) return p.slice(0, 3);
  const parent = p.slice(0, i);
  if (!parent) return p.slice(0, i + 1);
  if (/^[A-Za-z]:$/.test(parent)) return parent + "\\";
  return parent;
}
async function openDirBrowser(startAt) {
  if (!dirHome) {
    if (homeDir) {
      dirHome = homeDir;
    } else {
      try {
        const p = await api("/path", { noDir: true });
        dirHome = p.home || p.directory || "";
      } catch (e) { dirHome = ""; }
    }
  }
  dirCurrent = startAt || dirHome || "C:\\";
  $("dirMask").classList.add("show");
  await loadDirList();
}
async function loadDirList() {
  $("dirPath").textContent = dirCurrent;
  const listEl = $("dirList");
  listEl.innerHTML = "";
  const up = el("div", "dir-item");
  up.appendChild(iconEl("up"));
  up.appendChild(el("span", "dir-label", "..（上级目录）"));
  up.onclick = () => { dirCurrent = parentPath(dirCurrent); loadDirList(); };
  listEl.appendChild(up);

  let entries = [];
  try {
    entries = await api("/file?path=" + encodeURIComponent(dirCurrent), { directory: dirCurrent });
  } catch (e) {
    listEl.appendChild(el("div", "dir-empty", "无法读取该目录：" + e.message));
    return;
  }
  const dirs = (Array.isArray(entries) ? entries : []).filter(x => x.type === "directory");
  if (!dirs.length) {
    listEl.appendChild(el("div", "dir-empty", "（无子目录）"));
    return;
  }
  for (const d of dirs) {
    const item = el("div", "dir-item");
    item.appendChild(iconEl("folder"));
    item.appendChild(el("span", "dir-label", d.name));
    item.onclick = () => { dirCurrent = d.absolute || d.path; loadDirList(); };
    listEl.appendChild(item);
  }
}
$("dirCancel").onclick = () => $("dirMask").classList.remove("show");
$("dirChoose").onclick = () => {
  $("astDir").value = dirCurrent;
  astDirAuto = false;
  $("dirMask").classList.remove("show");
};
$("astBrowse").onclick = () => openDirBrowser($("astDir").value.trim() || null);

/* ============ 服务商与模型 ============ */
let providerData = null;
let providerAuthMap = null;
let localSecretProviders = [];
let localPlainProviders = [];
let localBaseURLs = {};
let localModels = {};
let oauthCtx = null;
let oauthPollTimer = null;
let oauthAuthUrl = "";

async function loadLocalSecrets() {
  try {
    const r = await api("/_secret", { noDir: true });
    localSecretProviders = (r && Array.isArray(r.providers)) ? r.providers : [];
    localPlainProviders = (r && Array.isArray(r.plain)) ? r.plain : [];
    localBaseURLs = (r && r.baseURL && typeof r.baseURL === "object") ? r.baseURL : {};
    localModels = (r && r.models && typeof r.models === "object") ? r.models : {};
  } catch (e) { localSecretProviders = []; localPlainProviders = []; localBaseURLs = {}; localModels = {}; }
}
async function loadProviders() {
  const list = await api("/provider", { noDir: true });
  let auth = {};
  try { auth = await api("/provider/auth", { noDir: true }); } catch (e) { auth = {}; }
  providerData = list || { all: [], connected: [] };
  providerAuthMap = auth || {};
  await loadLocalSecrets();
}
function providerMethods(id) {
  const m = providerAuthMap && providerAuthMap[id];
  return Array.isArray(m) ? m : [];
}
function providerConnected(id) {
  if (localSecretProviders.indexOf(id) >= 0) return true;
  if (!providerData) return false;
  if (Array.isArray(providerData.connected) && providerData.connected.indexOf(id) >= 0) return true;
  const p = (providerData.all || []).find(x => x.id === id);
  return !!(p && p.key);
}
async function openProviderManager() {
  $("providerFilter").value = "";
  $("providerMask").classList.add("show");
  $("providerList").innerHTML = '<div class="prov-empty">加载中…</div>';
  try { await loadProviders(); }
  catch (e) { $("providerList").innerHTML = '<div class="prov-empty">加载失败：' + escapeHtml(e.message) + "</div>"; return; }
  renderProviders();
}
function renderProviders() {
  const box = $("providerList");
  box.innerHTML = "";
  if (!providerData) { box.appendChild(el("div", "prov-empty", "加载中…")); return; }
  const filter = $("providerFilter").value.trim().toLowerCase();
  const list = (providerData.all || []).filter((p) => {
    if (!filter) return true;
    return ((p.id || "") + " " + (p.name || "")).toLowerCase().indexOf(filter) >= 0;
  }).sort((a, b) => String(a.name || a.id || "").localeCompare(String(b.name || b.id || "")));
  if (!list.length) { box.appendChild(el("div", "prov-empty", "没有匹配的服务商")); return; }
  for (const p of list) {
    const item = el("div", "prov-item");
    const head = el("div", "prov-head");
    const names = el("div", "prov-names");
    names.appendChild(el("span", "prov-name", p.name || p.id));
    names.appendChild(el("span", "prov-id", p.id));
    head.appendChild(names);
    const connected = providerConnected(p.id);
    const localOnly = localSecretProviders.indexOf(p.id) >= 0;
    head.appendChild(el("span", "prov-badge" + (connected ? " on" : ""), localOnly ? "本地加密" : (connected ? "已连接" : "未连接")));
    const mcount = p.models ? Object.keys(p.models).length : 0;
    head.appendChild(el("span", "prov-count", mcount + " 个模型"));
    const actions = el("div", "prov-actions");
    const methods = providerMethods(p.id).slice();
    if (p.id !== "opencode") methods.push({ type: "api", label: "手动 API Key（可自定义 Base URL）", manual: true });
    if (methods.length) {
      const b = el("button", "prov-action", connected ? "重新连接" : "连接");
      b.onclick = () => connectProvider(p, methods);
      actions.appendChild(b);
    }
    if (localOnly) {
      const bd = el("button", "prov-action", "断开");
      bd.onclick = async () => {
        try {
          await api("/_secret?provider=" + encodeURIComponent(p.id), { method: "DELETE", noDir: true });
          showToast("已移除本地加密密钥");
          await refreshAfterConnect();
        } catch (e) { showToast("移除失败：" + e.message, true); }
      };
      actions.appendChild(bd);
    }
    if (localPlainProviders.indexOf(p.id) >= 0) {
      const bp = el("button", "prov-action", "清除明文");
      bp.title = "从 opencode auth.json 移除明文密钥（备份为 auth.json.bak）";
      bp.onclick = async () => {
        if (!confirm("从 opencode 的 auth.json 移除「" + p.id + "」的明文密钥？（会备份为 auth.json.bak，需已重启 opencode 使加密密钥生效）")) return;
        try {
          await api("/_secret/purge", {
            method: "POST", noDir: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: p.id }),
          });
          showToast("已清除明文（已备份 .bak）");
          await refreshAfterConnect();
        } catch (e) { showToast("清除失败：" + e.message, true); }
      };
      actions.appendChild(bp);
    }
    if (mcount) {
      let modelsBox = null;
      const bm = el("button", "prov-action", "模型");
      bm.onclick = () => {
        item.classList.toggle("open");
        if (item.classList.contains("open") && !modelsBox) {
          modelsBox = el("div", "prov-models");
          Object.keys(p.models).sort().forEach((mid) => {
            const m = p.models[mid] || {};
            const chip = el("div", "prov-model", m.name || mid);
            chip.title = mid;
            chip.onclick = () => pickProviderModel(p.id, m.id || mid, m.name || mid);
            modelsBox.appendChild(chip);
          });
          item.appendChild(modelsBox);
        }
      };
      actions.appendChild(bm);
    }
    head.appendChild(actions);
    item.appendChild(head);
    box.appendChild(item);
  }
}
function pickProviderModel(providerID, modelID, name) {
  const a = activeAssistant();
  if (!a) { showToast("请先新建或选择一个助手", true); return; }
  a.model = { providerID, id: modelID };
  saveStore();
  defaultModel = a.model;
  localStorage.setItem("oc_model", JSON.stringify(a.model));
  updateModelSelect();
  showToast("已选择模型：" + name);
}
function connectProvider(p, methods) {
  if (methods.length === 1) { startAuth(p, 0, methods[0]); return; }
  openChoice("连接 " + (p.name || p.id), methods.map((m, i) => ({ label: m.label || m.type, value: i })), (i) => {
    startAuth(p, i, methods[i]);
  });
}
function startAuth(p, idx, method) {
  if (method.type === "api") {
    openProviderKey(p);
  } else if (method.type === "oauth") {
    startOAuth(p, idx, method);
  }
}
let provKeySaveFn = null;
function openProviderKey(p) {
  const existing = localSecretProviders.indexOf(p.id) >= 0;
  $("provKeyTitle").textContent = "连接 " + (p.name || p.id) + (existing ? "（留空 Key 仅更新 Base URL / 模型）" : "");
  $("provKeyInput").value = "";
  $("provBaseInput").value = localBaseURLs[p.id] || "";
  $("provModelsInput").value = (localModels[p.id] || []).join("\n");
  $("provKeyMask").classList.add("show");
  setTimeout(() => $("provKeyInput").focus(), 30);
  provKeySaveFn = async () => {
    const key = $("provKeyInput").value.trim();
    const baseURL = $("provBaseInput").value.trim();
    const models = $("provModelsInput").value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    $("provKeyInput").value = "";
    if (!key && !existing) { showToast("请输入 API Key", true); return; }
    $("provKeyMask").classList.remove("show");
    try {
      await api("/_secret", {
        method: "POST", noDir: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p.id, key, baseURL, models }),
      });
      try {
        await api("/_secret/purge", {
          method: "POST", noDir: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: p.id }),
        });
      } catch (e) { /* auth.json 可能不存在该键 */ }
      showToast("已加密保存；请重启 opencode 生效");
      await refreshAfterConnect();
    } catch (e) { showToast("保存失败：" + e.message, true); }
  };
}
$("provKeyCancel").onclick = () => {
  $("provKeyInput").value = "";
  $("provBaseInput").value = "";
  $("provModelsInput").value = "";
  $("provKeyMask").classList.remove("show");
};
$("provKeyOk").onclick = () => { if (provKeySaveFn) provKeySaveFn(); };
$("provKeyInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("provBaseInput").focus(); } });
$("provBaseInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("provKeyOk").click(); } });
$("provKeyMask").addEventListener("click", (e) => { if (e.target === $("provKeyMask")) $("provKeyCancel").click(); });
async function startOAuth(p, idx, method) {
  let auth;
  try {
    auth = await api("/provider/" + encodeURIComponent(p.id) + "/oauth/authorize", {
      method: "POST", noDir: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: idx }),
    });
  } catch (e) { showToast("发起 OAuth 失败：" + e.message, true); return; }
  oauthCtx = { id: p.id, idx: idx, mode: auth.method };
  oauthAuthUrl = auth.url || "";
  $("oauthTitle").textContent = (p.name || p.id) + " · OAuth 登录";
  $("oauthInstructions").textContent = auth.instructions || "已在浏览器打开授权页，完成后自动返回。";
  const needCode = auth.method === "code";
  $("oauthCodeField").style.display = needCode ? "" : "none";
  $("oauthSubmit").style.display = needCode ? "" : "none";
  $("oauthCode").value = "";
  $("oauthMask").classList.add("show");
  try { window.open(auth.url, "_blank", "noopener"); } catch (e) {}
  if (!needCode) pollOAuth(p.id);
}
function pollOAuth(id) {
  if (oauthPollTimer) clearInterval(oauthPollTimer);
  const start = Date.now();
  oauthPollTimer = setInterval(async () => {
    if (!oauthCtx || oauthCtx.id !== id || !$("oauthMask").classList.contains("show")) {
      clearInterval(oauthPollTimer); oauthPollTimer = null; return;
    }
    if (Date.now() - start > 180000) {
      clearInterval(oauthPollTimer); oauthPollTimer = null;
      showToast("OAuth 超时，请重试", true); return;
    }
    try {
      const list = await api("/provider", { noDir: true });
      providerData = list;
      if (Array.isArray(list.connected) && list.connected.indexOf(id) >= 0) {
        clearInterval(oauthPollTimer); oauthPollTimer = null;
        $("oauthMask").classList.remove("show");
        oauthCtx = null;
        showToast("已连接 " + id);
        await refreshAfterConnect();
      }
    } catch (e) { /* keep polling */ }
  }, 1500);
}
async function refreshAfterConnect() {
  try { await loadModels(); } catch (e) {}
  try { await loadProviders(); renderProviders(); } catch (e) {}
  updateModelSelect();
}
function openChoice(title, options, cb) {
  $("choiceTitle").textContent = title;
  const box = $("choiceList");
  box.innerHTML = "";
  options.forEach((o) => {
    const b = el("button", "choice-btn", o.label);
    b.onclick = () => { $("choiceMask").classList.remove("show"); cb(o.value); };
    box.appendChild(b);
  });
  $("choiceMask").classList.add("show");
}
$("providerOpen").onclick = openProviderManager;
$("providerClose").onclick = () => $("providerMask").classList.remove("show");
$("providerRefresh").onclick = async () => {
  $("providerList").innerHTML = '<div class="prov-empty">加载中…</div>';
  try { await loadProviders(); renderProviders(); } catch (e) { showToast("刷新失败：" + e.message, true); }
};
$("providerFilter").addEventListener("input", renderProviders);
$("providerMask").addEventListener("click", (e) => { if (e.target === $("providerMask")) $("providerMask").classList.remove("show"); });
$("choiceCancel").onclick = () => $("choiceMask").classList.remove("show");
$("choiceMask").addEventListener("click", (e) => { if (e.target === $("choiceMask")) $("choiceMask").classList.remove("show"); });
$("oauthOpen").onclick = () => { if (oauthAuthUrl) { try { window.open(oauthAuthUrl, "_blank", "noopener"); } catch (e) {} } };
$("oauthCancel").onclick = () => {
  oauthCtx = null;
  if (oauthPollTimer) { clearInterval(oauthPollTimer); oauthPollTimer = null; }
  $("oauthMask").classList.remove("show");
};
$("oauthMask").addEventListener("click", (e) => { if (e.target === $("oauthMask")) $("oauthCancel").click(); });
$("oauthSubmit").onclick = async () => {
  if (!oauthCtx) return;
  const code = $("oauthCode").value.trim();
  if (!code) return;
  const ctx = oauthCtx;
  try {
    await api("/provider/" + encodeURIComponent(ctx.id) + "/oauth/callback", {
      method: "POST", noDir: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: ctx.idx, code: code }),
    });
    oauthCtx = null;
    $("oauthMask").classList.remove("show");
    showToast("已连接 " + ctx.id);
    await refreshAfterConnect();
  } catch (e) { showToast("OAuth 失败：" + e.message, true); }
};

