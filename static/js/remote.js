/* ============ 远程访问（局域网） ============ */
/* 本机（loopback）免密；远程浏览器需在登录弹窗输入访问密码。
   远程模式（remote-mode）下隐藏敏感入口：设置、助手/文件夹管理、
   会话删除/重命名、回收站、服务商管理等。

   注意：端口 / 局域网配置的变更**不在服务内部自重启**（那会导致服务
   自身退出而没人接管端口）。保存后需重启本程序（重新双击 exe）生效，
   启动器会按配置重新绑定。 */
let remoteClient = false;
let remoteAuthed = true;

function isRemote() { return remoteClient; }

function remoteTxt(s, ...a) {
  if (typeof tf === "function" && a.length) return tf(s, ...a);
  if (typeof t === "function") return t(s);
  return s;
}

async function initRemote() {
  let st = null;
  try {
    const res = await fetch("/api/_remote/status", { cache: "no-store" });
    st = await res.json();
  } catch (e) { st = null; }
  if (!st || !st.ok) return true;
  remoteClient = !!st.remote;
  remoteAuthed = !!st.authed;
  if (!remoteClient) { renderRemoteSettings(); renderPortSettings(); return true; }
  document.documentElement.classList.add("remote-client");
  if (document.body) document.body.classList.add("remote-mode");
  if (!remoteAuthed) { showRemoteLogin(); return false; }
  applyRemoteSafeMode();
  return true;
}

function showRemoteLogin() {
  const mask = $("remoteLoginMask");
  if (!mask) return;
  mask.classList.add("show");
  const input = $("remotePw");
  const btn = $("remoteLoginBtn");
  const hint = $("remoteLoginHint");
  const submit = async () => {
    const pw = input ? input.value : "";
    if (!pw) { if (hint) hint.textContent = remoteTxt("请输入访问密码"); return; }
    if (btn) btn.disabled = true;
    if (hint) hint.textContent = remoteTxt("登录中…");
    try {
      const res = await fetch("/api/_login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j && j.ok) { location.reload(); return; }
      if (hint) hint.textContent = (j && j.error) ? j.error : remoteTxt("登录失败");
    } catch (e) {
      if (hint) hint.textContent = remoteTxt("登录失败");
    }
    if (btn) btn.disabled = false;
  };
  if (btn) btn.onclick = submit;
  if (input) {
    input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } };
    setTimeout(() => input.focus(), 50);
  }
}

function applyRemoteSafeMode() {
  ["settingsBtn", "restartAppBtn", "newAssistant", "newFolder", "trashOpen"].forEach((id) => {
    const e = $(id);
    if (e) e.style.display = "none";
  });
  const out = $("remoteLogout");
  if (out) {
    out.style.display = "";
    out.onclick = async () => {
      try { await fetch("/api/_logout", { method: "POST" }); } catch (e) { /* ignore */ }
      location.reload();
    };
  }
}

/* ---------- 设置：局域网访问（仅本机可见） ---------- */
async function renderRemoteSettings() {
  const sec = $("remoteSetting");
  const toggle = $("remoteToggle");
  if (!sec || !toggle) return;
  try {
    const r = await api("/_remote", { noDir: true });
    toggle.checked = !!r.enabled;
    const state = $("remoteState");
    if (state) state.textContent = r.enabled ? remoteTxt("已开启") : remoteTxt("未开启");
    const info = $("remoteInfo");
    if (info) {
      info.textContent = (r.addresses && r.addresses.length)
        ? remoteTxt("手机 / 其它设备访问地址：") + r.addresses.join("    ")
        : remoteTxt("未检测到局域网地址。");
    }
  } catch (e) {
    sec.style.display = "none";
  }
}

async function saveRemoteSettings() {
  const toggle = $("remoteToggle");
  const pwEl = $("remotePwInput");
  const body = { enabled: !!(toggle && toggle.checked) };
  const pw = pwEl ? pwEl.value : "";
  if (pw) body.password = pw;
  try {
    const r = await api("/_remote", {
      method: "POST", noDir: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (pwEl) pwEl.value = "";
    const state = $("remoteState");
    if (state) state.textContent = r.enabled ? remoteTxt("已开启") : remoteTxt("未开启");
    const info = $("remoteInfo");
    if (info && r.addresses && r.addresses.length) {
      info.textContent = remoteTxt("手机 / 其它设备访问地址：") + r.addresses.join("    ");
    }
    showToast(remoteTxt("已保存，请重启本程序生效"));
  } catch (e) {
    showToast(remoteTxt("保存失败：") + e.message, true);
  }
}

/* ---------- 设置：服务端口 ---------- */
async function renderPortSettings() {
  const inp = $("portInput");
  if (!inp) return;
  try {
    const r = await api("/_server", { noDir: true });
    if (r && r.active) {
      inp.value = r.active;
      const state = $("portState");
      if (state) state.textContent = remoteTxt("当前：") + r.active;
    }
  } catch (e) {
    const sec = $("portSetting");
    if (sec) sec.style.display = "none";
  }
}

async function saveServerPort() {
  const inp = $("portInput");
  const port = parseInt(inp ? inp.value : "", 10);
  if (!port || port < 1024 || port > 65535) {
    showToast(remoteTxt("端口需为 1024–65535 之间的整数"), true);
    return;
  }
  try {
    const r = await api("/_server", {
      method: "POST", noDir: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port: port }),
    });
    const state = $("portState");
    if (state) state.textContent = remoteTxt("将使用：") + r.port;
    showToast(remoteTxt("已保存，请重启本程序生效"));
  } catch (e) {
    showToast(remoteTxt("保存失败：") + e.message, true);
  }
}

if ($("remoteSave")) $("remoteSave").onclick = saveRemoteSettings;
if ($("portSave")) $("portSave").onclick = saveServerPort;
