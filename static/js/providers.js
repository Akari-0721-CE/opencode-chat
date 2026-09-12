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
    allToolIds = ["question", "bash", "read", "glob", "grep", "edit", "write", "task", "webfetch", "todowrite", "websearch", "skill", "apply_patch"];
  }
}

function updateModelSelect() {
  const a = activeAssistant();
  const val = currentModelValue();
  modelSelect.value = val;
  const lbl = $("modelPickLabel");
  if (lbl) lbl.textContent = a ? modelDisplayName(a.model) : "（无助手）";
  const btn = $("modelPickBtn");
  if (btn) btn.disabled = !a;
  updateVariantSelect();
  if (a) updateCtxRing();
  const pop = $("modelPop");
  if (pop && !pop.hidden) renderModelList();
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

function applyModelSelection(val) {
  const a = activeAssistant();
  if (!a) return;
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
  modelSelect.value = val || "";
  updateVariantSelect();
  updateModelSelect();
}
modelSelect.onchange = () => applyModelSelection(modelSelect.value);

/* ============ 模型选择器（搜索 + 折叠提供商） ============ */
function currentModelValue() {
  const a = activeAssistant();
  return (a && a.model) ? modelKey(a.model.providerID, a.model.id) : "";
}
function modelDisplayName(ref) {
  if (!ref) return "（默认模型）";
  const m = (typeof findModel === "function") ? findModel({ providerID: ref.providerID, modelID: ref.id || ref.modelID }) : null;
  return (m && (m.name || m.id)) || ref.id || ref.modelID || "模型";
}
let modelCollapsed = (function () {
  try {
    const arr = JSON.parse(localStorage.getItem("oc_model_collapsed") || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) { return new Set(); }
})();
function saveModelCollapsed() {
  try { localStorage.setItem("oc_model_collapsed", JSON.stringify(Array.from(modelCollapsed))); } catch (e) {}
}
function filterModelGroups(providers, qRaw) {
  const q = String(qRaw || "").trim().toLowerCase();
  const out = [];
  for (const prov of providers || []) {
    const pName = prov.name || prov.id || "";
    const provMatch = !q || pName.toLowerCase().indexOf(q) >= 0 || String(prov.id || "").toLowerCase().indexOf(q) >= 0;
    const models = prov.models || [];
    const items = provMatch ? models : models.filter((m) =>
      (m.name || m.id || "").toLowerCase().indexOf(q) >= 0 || String(m.id || "").toLowerCase().indexOf(q) >= 0);
    if (items.length) out.push({ prov, items: items, all: provMatch });
  }
  return out;
}
function renderModelItems(box, q, current, onPick, emptyLabel, rerender) {
  if (!box) return;
  const query = String(q || "").trim().toLowerCase();
  box.innerHTML = "";
  if (emptyLabel != null) {
    const d = el("button", "model-item" + (current === "" ? " on" : ""));
    d.type = "button";
    d.textContent = emptyLabel;
    d.onclick = () => onPick("");
    box.appendChild(d);
  }
  const groups = filterModelGroups(modelsByProvider, query);
  if (!groups.length) { box.appendChild(el("div", "model-empty", "没有匹配的模型")); return; }
  for (const g of groups) {
    const prov = g.prov;
    const collapsed = !query && modelCollapsed.has(prov.id);
    const head = el("button", "model-group");
    head.type = "button";
    head.appendChild(el("span", "model-group-name", prov.name || prov.id));
    head.appendChild(el("span", "model-group-count", String(g.items.length)));
    head.appendChild(el("span", "model-group-chev" + (collapsed ? "" : " open"), "▸"));
    head.onclick = () => {
      if (modelCollapsed.has(prov.id)) modelCollapsed.delete(prov.id);
      else modelCollapsed.add(prov.id);
      saveModelCollapsed();
      if (typeof rerender === "function") rerender();
    };
    box.appendChild(head);
    if (collapsed) continue;
    for (const m of g.items) {
      const val = modelKey(m.providerID, m.id);
      const b = el("button", "model-item" + (val === current ? " on" : ""));
      b.type = "button";
      b.appendChild(el("span", "model-item-name", m.name || m.id));
      b.title = (prov.name || prov.id) + " · " + (m.name || m.id);
      b.onclick = () => onPick(val);
      box.appendChild(b);
    }
  }
}
function renderModelList() {
  const box = $("modelList");
  const q = ($("modelSearch") && $("modelSearch").value) || "";
  renderModelItems(box, q, currentModelValue(), (v) => { applyModelSelection(v); closeModelPop(); }, "（默认模型）", renderModelList);
}
function openModelPop() {
  const pop = $("modelPop");
  if (!pop) return;
  if ($("modelSearch")) $("modelSearch").value = "";
  pop.hidden = false;
  renderModelList();
  setTimeout(() => { if ($("modelSearch")) $("modelSearch").focus(); }, 20);
}
function closeModelPop() {
  const pop = $("modelPop");
  if (pop) pop.hidden = true;
}
if ($("modelPickBtn")) {
  $("modelPickBtn").onclick = (e) => {
    e.stopPropagation();
    if ($("modelPop").hidden) openModelPop(); else closeModelPop();
  };
}
if ($("modelSearch")) {
  $("modelSearch").addEventListener("input", renderModelList);
  $("modelSearch").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeModelPop(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const first = $("modelList").querySelector(".model-item");
      if (first) first.click();
    }
  });
}
document.addEventListener("click", (e) => {
  const pick = $("modelPick");
  if (pick && !pick.contains(e.target)) closeModelPop();
});

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
    const tr = (s) => (typeof t === "function" ? t(s) : s);
    head.appendChild(el("span", "prov-badge" + (connected ? " on" : ""), localOnly ? tr("本地加密") : (connected ? tr("已连接") : tr("未连接"))));
    const mcount = p.models ? Object.keys(p.models).length : 0;
    head.appendChild(el("span", "prov-count", mcount + " 个模型"));
    const actions = el("div", "prov-actions");
    const methods = providerMethods(p.id).slice();
    if (p.id !== "opencode") methods.push({ type: "api", label: (typeof t === "function" ? t("手动 API Key（可自定义 Base URL）") : "手动 API Key（可自定义 Base URL）"), manual: true });
    if (methods.length) {
      const b = el("button", "prov-action", connected ? (typeof t === "function" ? t("重新连接") : "重新连接") : (typeof t === "function" ? t("连接") : "连接"));
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
        if (!(await confirmDialog({ title: "清除明文密钥", text: "从 opencode 的 auth.json 移除「" + p.id + "」的明文密钥？（会备份为 auth.json.bak，需已重启 opencode 使加密密钥生效）", okText: "清除", danger: true }))) return;
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
  showToast(typeof tf === "function" ? tf("已选择模型：{0}", name) : ("已选择模型：" + name));
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
      showToast(typeof t === "function" ? t("已保存，正在重启 opencode 使密钥生效…") : "已保存，正在重启 opencode 使密钥生效…");
      const ok = await restartOpencode();
      await refreshAfterConnect();
      if (ok) showToast(typeof tf === "function" ? tf("已连接并生效：{0}", p.name || p.id) : ("已连接并生效：" + (p.name || p.id)));
      else showToast("已保存，但重启 opencode 失败；可点右上角 ↻ 重启按钮重试", true);
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
        showToast(typeof tf === "function" ? tf("已连接 {0}", id) : ("已连接 " + id));
        await refreshAfterConnect();
      }
    } catch (e) { /* keep polling */ }
  }, 1500);
}
async function restartOpencode() {
  try {
    const r = await api("/_opencode/restart", { method: "POST", noDir: true });
    if (r && r.ok) { await new Promise((res) => setTimeout(res, 800)); return true; }
    if (r && r.error) console.warn("restart opencode:", r.error);
    return false;
  } catch (e) { console.warn("restart opencode failed:", e); return false; }
}
async function refreshAfterConnect() {
  try { await loadModels(); } catch (e) {}
  try { await loadProviders(); renderProviders(); } catch (e) {}
  updateModelSelect();
}

/* ============ 首次运行：opencode 准备/下载进度提示 ============ */
let bootHintTimer = null;
const BOOT_ACTIVE_STATES = ["preparing", "downloading", "verifying", "extracting", "installing-npm"];
function showBootHint(text, pct) {
  const box = document.getElementById("ocBootHint");
  if (!box) return;
  box.hidden = false;
  const txt = document.getElementById("ocBootHintText");
  if (txt) txt.textContent = text;
  const fill = document.getElementById("ocBootHintFill");
  const bar = document.getElementById("ocBootHintBar");
  if (fill && bar) {
    if (pct == null || pct < 0) { bar.style.visibility = "hidden"; }
    else { bar.style.visibility = ""; fill.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + "%"; }
  }
}
function hideBootHint() {
  const box = document.getElementById("ocBootHint");
  if (box) box.hidden = true;
}
async function pollOpencodeStatus() {
  const tr = (s) => (typeof t === "function" ? t(s) : s);
  const trf = (s, ...a) => (typeof tf === "function" ? tf(s, ...a) : s.replace(/\{(\d+)\}/g, (m, i) => (a[i] != null ? a[i] : m)));
  let st = {};
  try { const r = await api("/_opencode/status", { noDir: true }); st = (r && r.status) || {}; } catch (e) { st = {}; }
  const state = String(st.state || "");
  const ready = !!(st.upstream_ready || st.installed);
  if (ready && BOOT_ACTIVE_STATES.indexOf(state) < 0) { hideBootHint(); return false; }
  const mb = (st.received || 0) / 1048576;
  let text = tr("正在准备 opencode（首次运行需下载运行组件）…");
  let pct = -1;
  if (state === "downloading") {
    if (st.total) {
      const tmb = st.total / 1048576;
      pct = tmb ? (mb / tmb) * 100 : -1;
      text = trf("正在下载 opencode：{0} / {1} MB", mb.toFixed(1), tmb.toFixed(1));
    } else {
      text = trf("正在下载 opencode… 已 {0} MB", mb.toFixed(1));
    }
  } else if (state === "verifying") {
    text = tr("正在校验 opencode 完整性…");
  } else if (state === "extracting") {
    text = tr("正在解压 opencode 运行组件…");
  } else if (state === "installing-npm") {
    text = tr("正在通过 npm 安装 opencode…（可能需要几分钟）");
  } else if (state === "error") {
    text = trf("opencode 准备失败：{0}（可重开程序自动重试）", st.error || tr("未知错误"));
  } else if (!ready) {
    text = tr("正在启动 opencode 本地服务…");
  }
  showBootHint(text, pct);
  return state !== "error";
}
function startBootWatch() {
  if (bootHintTimer) return;
  const tick = async () => {
    const cont = await pollOpencodeStatus();
    if (!cont) {
      if (bootHintTimer) { clearInterval(bootHintTimer); bootHintTimer = null; }
      try { await refreshAfterConnect(); } catch (e) { /* ignore */ }
    }
  };
  tick();
  bootHintTimer = setInterval(tick, 1500);
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
if ($("providerRestart")) {
  $("providerRestart").onclick = async () => {
    const btn = $("providerRestart");
    btn.disabled = true;
    showToast("正在重启 opencode…");
    const ok = await restartOpencode();
    await refreshAfterConnect();
    btn.disabled = false;
    showToast(ok ? "opencode 已重启" : "重启失败，请查看日志", !ok);
  };
}
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
    showToast(typeof tf === "function" ? tf("已连接 {0}", ctx.id) : ("已连接 " + ctx.id));
    await refreshAfterConnect();
  } catch (e) { showToast("OAuth 失败：" + e.message, true); }
};

