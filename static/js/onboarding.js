/* ============ 首启向导 + 内置默认助手 ============ */
const ONBOARD_KEY = "oc_onboarded";
const ONBOARD_TEST_TIMEOUT = 60000;
const FREE_ZEN_MODELS = [
  "big-pickle",
  "mimo-v2.5-free",
  "ling-3.0-flash-fin-free",
  "nemotron-3.5-lightning-free",
  "nemotron-3-ultra-free",
  "muse-spark-1.3-contributor-free",
  "gpt-5-nano",
];
const DEFAULT_ASSISTANT_PROMPT = [
  "你是「opencode chat」桌面应用的使用助手，用简体中文、简洁、友好地回答用户关于本软件的问题。",
  "本软件把 opencode（AI 编码代理）与本前端打包在一起。常见问题：",
  "1) 连接模型：设置 → 服务商与模型 → 管理；官方 opencode Zen 含免费模型（需登录 opencode.ai 获取 Key）。",
  "2) 新建助手：左侧「新建助手」，选择工作区目录；每个助手对应一个工作目录。",
  "3) 消息功能：发送/回车、附件与图片裁剪、OCR 识图、消息翻译、收藏、会话搜索与回收站。",
  "4) 外观：设置 → 渲染质量（性能优先 / 标准 / 高质量）、背景（本地图片 / 本地视频 / 动态预设）。",
  "5) 快捷键：Ctrl+Enter 发送、Alt+N 新会话、Ctrl+, 设置、Ctrl+F 搜索、Esc 中止生成。",
  "回答时优先给出「点哪里、怎么做」的步骤；不确定的官方细节可用联网搜索/抓取查阅 opencode 文档。",
].join("\n");

function onboardFreeModel() {
  for (const id of FREE_ZEN_MODELS) {
    if (typeof findModel === "function" && findModel({ providerID: "opencode", modelID: id })) {
      return { providerID: "opencode", id: id };
    }
  }
  const prov = (modelsByProvider || []).find((p) => p.id === "opencode");
  if (prov && prov.models && prov.models.length) return { providerID: "opencode", id: prov.models[0].id };
  return null;
}

function seedDefaultAssistant() {
  if (S.assistants && S.assistants.length) return;
  const dir = (typeof uniqueWorkspace === "function") ? uniqueWorkspace("使用答疑") : "";
  const model = onboardFreeModel();
  S.assistants.push({
    id: uid("ast"),
    name: (typeof t === "function") ? t("使用答疑助手") : "使用答疑助手",
    icon: "?",
    avatar: "",
    folderId: null,
    directory: dir,
    agent: "build",
    model: model,
    variant: null,
    temperature: null,
    topP: null,
    system: DEFAULT_ASSISTANT_PROMPT,
    overrideBase: false,
    pureInput: false,
    gitSafe: true,
    autoOcr: false,
    disabledTools: ["bash", "write", "edit", "apply_patch"],
    favorite: true,
  });
  if (dir) {
    if (typeof markDirUsed === "function") markDirUsed(dir);
    if (typeof ensureWorkspaceDir === "function") ensureWorkspaceDir(dir).catch(() => {});
  }
}

/* ---------- 向导 UI ---------- */
let onboardStep = 1;
let onboardPoll = null;

function onboardMask() {
  let m = document.getElementById("onboardMask");
  if (m) return m;
  m = document.createElement("div");
  m.id = "onboardMask";
  m.className = "modal-mask onboard-mask";
  m.innerHTML =
    '<div class="modal onboard">' +
    '<h3 id="onboardTitle">欢迎使用 opencode chat</h3>' +
    '<div id="onboardBody" class="onboard-body"></div>' +
    '<div class="btn-row space" id="onboardActions"></div>' +
    "</div>";
  document.body.appendChild(m);
  return m;
}

function onboardAction(label, cls, fn) {
  const b = el("button", cls || "btn-allow", label);
  b.type = "button";
  b.onclick = fn;
  return b;
}

function onboardRenderActions(actions) {
  const box = document.getElementById("onboardActions");
  box.innerHTML = "";
  for (const a of actions) {
    if (a.spacer) { const s = el("span", ""); s.style.flex = "1"; box.appendChild(s); }
    else box.appendChild(onboardAction(a.label, a.cls, a.fn));
  }
}

function showOnboarding() {
  onboardStep = 1;
  onboardMask().classList.add("show");
  onboardRender();
  onboardStartPoll();
}
function closeOnboarding() {
  const m = document.getElementById("onboardMask");
  if (m) m.classList.remove("show");
  if (onboardPoll) { clearInterval(onboardPoll); onboardPoll = null; }
}
function startOnboarding() { showOnboarding(); }

function onboardRender() {
  const title = document.getElementById("onboardTitle");
  const body = document.getElementById("onboardBody");
  if (onboardStep === 1) {
    title.textContent = "欢迎使用 opencode chat";
    body.innerHTML =
      '<p class="onboard-p">这是一个本地运行的 AI 对话前端。三步即可开始：</p>' +
      '<ol class="onboard-list">' +
      "<li>连接一个模型服务商（可用 opencode Zen 的免费模型，或你自己的 API Key）</li>" +
      "<li>自动创建一个「使用答疑助手」和专属工作区</li>" +
      "<li>开始对话</li>" +
      "</ol>" +
      '<p class="onboard-note">所有数据都保存在本机，不会上传到我们的服务器。</p>' +
      '<div class="onboard-lang">语言 / Language：' +
      '<button type="button" class="mini-link" id="onboardLangZh">中文</button>' +
      '<button type="button" class="mini-link" id="onboardLangEn">English</button></div>';
    const bz = document.getElementById("onboardLangZh");
    const be = document.getElementById("onboardLangEn");
    if (bz) bz.onclick = () => { if (typeof setLang === "function") setLang("zh"); onboardRender(); };
    if (be) be.onclick = () => { if (typeof setLang === "function") setLang("en"); onboardRender(); };
    onboardRenderActions([
      { label: "以后再说", cls: "btn-cancel", fn: () => { if (typeof markOnboarded === "function") markOnboarded(); closeOnboarding(); } },
      { label: "开始配置 →", cls: "btn-allow", fn: () => { onboardStep = 2; onboardRender(); } },
    ]);
  } else if (onboardStep === 2) {
    title.textContent = "连接模型服务商";
    body.innerHTML =
      '<p class="onboard-p">选择一种方式连接模型：</p>' +
      '<div class="onboard-cards">' +
      '<div class="onboard-card"><div class="onboard-card-t">opencode Zen（推荐）</div>' +
      '<div class="onboard-card-d">官方精选模型，含免费额度（Big Pickle / MiMo Free 等）。需登录 opencode.ai 获取 API Key。</div>' +
      '<button type="button" class="btn-allow" id="onboardZen">连接 opencode Zen</button></div>' +
      '<div class="onboard-card"><div class="onboard-card-t">其它服务商</div>' +
      '<div class="onboard-card-d">OpenAI / Anthropic / DeepSeek / OpenRouter / 自定义 Base URL 等，填你自己的 API Key。</div>' +
      '<button type="button" class="btn-cancel" id="onboardOther">打开服务商管理</button></div>' +
      "</div>" +
      '<div class="onboard-status" id="onboardProvStatus">正在检测已连接的服务商…</div>';
    document.getElementById("onboardZen").onclick = onboardConnectZen;
    document.getElementById("onboardOther").onclick = () => {
      if (typeof openProviderManager === "function") openProviderManager();
    };
    onboardRenderActions([
      { label: "← 上一步", cls: "btn-cancel", fn: () => { onboardStep = 1; onboardRender(); } },
      { label: "下一步 →", cls: "btn-allow", fn: () => { onboardStep = 3; onboardRender(); } },
    ]);
    updateOnboardProviderStatus();
  } else {
    title.textContent = "准备就绪";
    const a = typeof activeAssistant === "function" ? activeAssistant() : null;
    const name = (a && a.name) || "使用答疑助手";
    const dir = (a && a.directory) || "（未设置）";
    body.innerHTML =
      '<p class="onboard-p">已为你创建默认助手：</p>' +
      '<div class="onboard-summary"><div><b>' + escapeHtml(name) + "</b></div>" +
      '<div class="onboard-sub">工作区：' + escapeHtml(dir) + "</div>" +
      '<div class="onboard-sub">模型：' + escapeHtml(onboardModelLabel()) + "</div></div>" +
      '<div class="onboard-status" id="onboardTestStatus">可点「测试连接」验证 Key 是否可用。</div>';
    onboardRenderActions([
      { label: "← 上一步", cls: "btn-cancel", fn: () => { onboardStep = 2; onboardRender(); } },
      { label: "测试连接", cls: "btn-cancel", fn: onboardDoTest },
      { label: "完成，开始使用", cls: "btn-allow", fn: onboardFinish },
    ]);
  }
  if (typeof translateDom === "function") translateDom(document.getElementById("onboardMask"));
}

function onboardModelLabel() {
  const a = typeof activeAssistant === "function" ? activeAssistant() : null;
  const ref = (a && a.model) || (typeof fallbackModel === "function" ? fallbackModel() : null);
  if (!ref) return (typeof t === "function") ? t("（默认模型）") : "（默认模型）";
  return (typeof modelDisplayName === "function" ? modelDisplayName(ref) : (ref.id || ""));
}

async function ensureProvidersLoaded() {
  if (!providerData && typeof loadProviders === "function") {
    try { await loadProviders(); } catch (e) { /* ignore */ }
  }
}

async function onboardConnectZen() {
  await ensureProvidersLoaded();
  const p = (providerData && providerData.all ? providerData.all : []).find((x) => x.id === "opencode");
  if (!p) { showToast("未找到 opencode Zen，请用「其它服务商」", true); return; }
  const methods = typeof providerMethods === "function" ? providerMethods("opencode") : [];
  if (!methods.length) { if (typeof openProviderKey === "function") openProviderKey(p); }
  else if (typeof connectProvider === "function") connectProvider(p, methods);
}

function onboardStartPoll() {
  if (onboardPoll) return;
  onboardPoll = setInterval(async () => {
    const m = document.getElementById("onboardMask");
    if (!m || !m.classList.contains("show")) { clearInterval(onboardPoll); onboardPoll = null; return; }
    await ensureProvidersLoaded();
    try { await loadProviders(); } catch (e) { /* ignore */ }
    updateOnboardProviderStatus();
  }, 2500);
}

function updateOnboardProviderStatus() {
  const node = document.getElementById("onboardProvStatus");
  if (!node) return;
  const all = (providerData && providerData.all) || [];
  const connected = all.filter((p) => typeof providerConnected === "function" && providerConnected(p.id))
    .map((p) => p.name || p.id);
  const tr = (s) => (typeof t === "function" ? t(s) : s);
  node.textContent = connected.length
    ? tr("已连接：") + connected.join("、")
    : tr("尚未连接任何服务商（可先跳过，稍后在设置里连接）。");
}

async function onboardFinish() {
  markOnboarded();
  closeOnboarding();
  if (typeof refreshAssistantChrome === "function") refreshAssistantChrome();
  if (typeof renderTree === "function") renderTree();
  showToast(typeof t === "function" ? t("配置完成，开始对话吧") : "配置完成，开始对话吧");
  const a = typeof activeAssistant === "function" ? activeAssistant() : null;
  if (a && currentSession === null) {
    try { await activateAssistant(a.id, { restore: false }); } catch (e) { /* ignore */ }
  }
}

function markOnboarded() {
  try { localStorage.setItem(ONBOARD_KEY, "1"); } catch (e) { /* ignore */ }
  if (typeof saveProfile === "function") saveProfile();
}

/* ---------- 连通性测试（临时会话） ---------- */
function onboardScratchDir() {
  const home = String(homeDir || "").replace(/[\\/]+$/, "");
  if (!home) return "";
  return home + "\\.config\\opencode-chat\\onboard-scratch";
}
async function onboardDoTest() {
  const tr = (s) => (typeof t === "function" ? t(s) : s);
  const node = document.getElementById("onboardTestStatus");
  if (node) node.textContent = tr("正在测试…（最多 60 秒）");
  const a = typeof activeAssistant === "function" ? activeAssistant() : null;
  const ref = (a && a.model) || (typeof fallbackModel === "function" ? fallbackModel() : null);
  try {
    const out = await onboardTestConnection(ref);
    if (node) node.textContent = tr("连接正常，模型回复：") + out;
  } catch (e) {
    if (node) node.textContent = tr("测试失败：") + e.message;
  }
}
async function onboardTestConnection(ref) {
  if (!ref) throw new Error("尚无可用的模型（请先连接服务商）");
  const dir = onboardScratchDir();
  if (!dir) throw new Error("无法确定测试目录（opencode 可能未就绪）");
  await ensureWorkspaceDir(dir);
  try {
    const list = await api("/session", { directory: dir });
    for (const s of (Array.isArray(list) ? list : [])) {
      try { await api("/session/" + s.id, { method: "DELETE", directory: dir }); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
  const ts = await api("/session", {
    method: "POST", directory: dir,
    headers: { "Content-Type": "application/json" }, body: "{}",
  });
  const sid = ts.id;
  try {
    const body = {
      parts: [{ type: "text", text: "只回复两个字母：ok" }],
      model: { providerID: ref.providerID, modelID: ref.id || ref.modelID },
    };
    if (allToolIds.length) body.tools = Object.fromEntries(allToolIds.map((id) => [id, false]));
    await api("/session/" + sid + "/prompt_async", {
      method: "POST", directory: dir,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const t0 = Date.now();
    while (Date.now() - t0 < ONBOARD_TEST_TIMEOUT) {
      let msgs = null;
      try { msgs = await api("/session/" + sid + "/message", { directory: dir }); } catch (e) { msgs = null; }
      if (Array.isArray(msgs)) {
        const last = [...msgs].reverse().find((m) => m.info && m.info.role === "assistant");
        if (last && last.info.time && last.info.time.completed) {
          if (last.info.error) throw new Error((typeof messageErrorText === "function" ? messageErrorText(last.info) : "模型返回错误") || "模型返回错误");
          return messageTextParts(last).trim() || "(空回复)";
        }
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    throw new Error("超时，模型无响应");
  } finally {
    try { await api("/session/" + sid, { method: "DELETE", directory: dir }); } catch (e) { /* ignore */ }
  }
}

/* ---------- 入口 ---------- */
function maybeShowOnboarding() {
  try { if (localStorage.getItem(ONBOARD_KEY) === "1") return; } catch (e) { /* ignore */ }
  // 老用户（已有本地密钥/已连接服务商且有助手）不打扰
  const hasLocal =
    (typeof localSecretProviders !== "undefined" && Array.isArray(localSecretProviders) && localSecretProviders.length > 0) ||
    (typeof localPlainProviders !== "undefined" && Array.isArray(localPlainProviders) && localPlainProviders.length > 0);
  if (hasLocal && S.assistants.length) return;
  showOnboarding();
}
if (document.getElementById("onboardRerun")) {
  document.getElementById("onboardRerun").onclick = () => {
    const sm = document.getElementById("settingsMask");
    if (sm) sm.classList.remove("show");
    startOnboarding();
  };
}
