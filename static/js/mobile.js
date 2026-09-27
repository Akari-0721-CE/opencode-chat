/* ============ 移动端：抽屉侧栏 ============ */
function mobileNavOpen() { return document.body.classList.contains("mobile-nav-open"); }
function setMobileNav(open) { document.body.classList.toggle("mobile-nav-open", !!open); }

if ($("mobileMenu")) {
  $("mobileMenu").onclick = () => setMobileNav(!mobileNavOpen());
}
if ($("sidebarBackdrop")) {
  $("sidebarBackdrop").onclick = () => setMobileNav(false);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && mobileNavOpen()) {
    setMobileNav(false);
    e.stopPropagation();
  }
});
(function () {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar || !sidebar.addEventListener) return;
  sidebar.addEventListener("click", (e) => {
    if (!mobileNavOpen()) return;
    if (e.target.closest && e.target.closest(".row-actions")) return;
    if (e.target.closest && e.target.closest(".row, .session-list li")) setMobileNav(false);
  });
})();

/* ============ 全屏 ============ */
function fsElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}
function fsSupported() {
  return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
}
function updateFullscreenBtn() {
  const b = $("fullscreenBtn");
  if (!b) return;
  b.title = fsElement() ? "退出全屏" : "全屏";
  b.setAttribute("aria-label", b.title);
}
function toggleFullscreen() {
  if (!fsSupported()) {
    if (typeof showToast === "function") showToast("当前浏览器不支持全屏，可用「添加到主屏幕」以全屏打开", true);
    return;
  }
  const el = document.documentElement;
  if (fsElement()) {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    try { fn.call(document); } catch (e) { /* ignore */ }
  } else {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    try { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }
}
if ($("fullscreenBtn")) {
  $("fullscreenBtn").onclick = toggleFullscreen;
  document.addEventListener("fullscreenchange", updateFullscreenBtn);
  document.addEventListener("webkitfullscreenchange", updateFullscreenBtn);
  updateFullscreenBtn();
}

/* ============ 安卓 App 检测 / 原生基础设置 ============ */
/* WebView 壳通过 addJavascriptInterface 注入 window.OCAndroid。网页侧据其
   应用「暗色模式 / 字号」等原生设置，并提供保存 / 分享文件的桥接。 */
function ocNative() {
  try {
    if (typeof window !== "undefined" && window.OCAndroid && typeof window.OCAndroid.getSettings === "function") return window.OCAndroid;
  } catch (e) { /* ignore */ }
  return null;
}
function isAndroidApp() { return !!ocNative(); }
function normalizeThemePref(v) { return (v === "dark" || v === "light") ? v : "auto"; }
function clampFontSize(v) {
  const n = parseInt(v, 10);
  if (!isFinite(n)) return 15;
  return Math.min(22, Math.max(12, n));
}
function nativeSettings() {
  const n = ocNative();
  if (!n) return null;
  try {
    const o = JSON.parse(n.getSettings() || "{}") || {};
    o.theme = normalizeThemePref(o.theme);
    o.fontSize = clampFontSize(o.fontSize);
    return o;
  } catch (e) { return null; }
}
function applyNativeChrome() {
  const on = !!ocNative();
  document.documentElement.classList.toggle("oc-android", on);
  if (document.body) document.body.classList.toggle("oc-android", on);
  return on;
}
function applyNativeSettings() {
  if (!applyNativeChrome()) return false;
  const s = nativeSettings();
  if (!s) return true;
  if (typeof applyThemeMode === "function") applyThemeMode(s.theme);
  if (typeof applyFontSize === "function") applyFontSize(s.fontSize);
  return true;
}
if ($("nativeSettingsBtn")) {
  $("nativeSettingsBtn").onclick = () => {
    const n = ocNative();
    if (n && n.openSettings) n.openSettings();
    else showToast("请从安卓 App 内使用该设置", true);
  };
}
applyNativeSettings();
window.addEventListener("pageshow", () => setTimeout(applyNativeSettings, 60));

/* ============ 安卓文件：保存 / 分享 / 外部打开 ============ */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error("读取失败"));
    fr.readAsDataURL(blob);
  });
}
async function srcToDataUrl(src) {
  const s = String(src || "");
  if (s.startsWith("data:")) return s;
  const res = await fetch(s, { credentials: "include" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return blobToDataUrl(await res.blob());
}
function guessFileName(src, fallback) {
  const s = String(src || "");
  let name = "";
  try {
    const u = new URL(s, location.href);
    name = (u.pathname.split("/").pop() || "");
  } catch (e) { name = ""; }
  if (!name || name.indexOf(".") < 0) {
    const ext = s.startsWith("data:image/png") ? "png" : (s.startsWith("data:image/webp") ? "webp" : "jpg");
    name = (fallback ? String(fallback).replace(/[\\/:*?"<>|]/g, "-").slice(0, 40) : "opencode") + "-" + Date.now() + "." + ext;
  }
  try { return decodeURIComponent(name); } catch (e) { return name; }
}
async function saveToPhone(src, name) {
  const n = ocNative();
  if (!n || !n.saveDataUrl) { showToast("当前环境不支持保存到手机", true); return false; }
  try {
    const dataUrl = await srcToDataUrl(src);
    const mime = (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || "application/octet-stream";
    n.saveDataUrl(guessFileName(src, name), mime, dataUrl);
    return true;
  } catch (e) {
    showToast("保存失败：" + e.message, true);
    return false;
  }
}
function openInExternal(src) {
  const n = ocNative();
  if (n && n.openExternal) { n.openExternal(String(src || "")); return true; }
  return false;
}
function openMessageFile(part) {
  const url = part && part.url;
  if (!url) { showToast("该文件没有可打开的内容", true); return; }
  if (String(part.mime || "").startsWith("image/")) { openImageViewer(url, part.filename || ""); return; }
  if (openInExternal(url)) return;
  try { window.open(url, "_blank", "noopener"); } catch (e) { location.href = url; }
}
if ($("ivSave")) {
  $("ivSave").onclick = () => {
    const src = (typeof ivImg !== "undefined" && ivImg) ? (ivImg.currentSrc || ivImg.src) : "";
    if (src) saveToPhone(src, $("ivName") ? $("ivName").textContent : "");
  };
}
if ($("cameraBtn")) $("cameraBtn").onclick = () => { if ($("cameraInput")) $("cameraInput").click(); };
if ($("cameraInput")) {
  $("cameraInput").onchange = () => {
    const files = $("cameraInput").files;
    if (files && files.length && typeof addFiles === "function") addFiles(files);
    $("cameraInput").value = "";
  };
}

/* ============ 抽屉手势：左边缘滑开 / 左滑关闭 ============ */
const DRAWER_EDGE = 28;
function edgeSwipeIntent(o) {
  const dx = o.endX - o.startX;
  const dy = o.endY - o.startY;
  if (Math.abs(dy) > Math.abs(dx)) return "none";
  if (!o.open) return (o.startX <= o.edge && dx > (o.trigger || 40)) ? "open" : "none";
  return (dx < -(o.trigger || 40)) ? "close" : "none";
}
(function initDrawerSwipe() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar || !sidebar.addEventListener || !document.addEventListener) return;
  const drawerWidth = () => Math.min(window.innerWidth * 0.84, 330);
  let st = null;
  document.addEventListener("touchstart", (e) => {
    if (window.innerWidth > 820) return;
    if (!e.touches || e.touches.length !== 1) return;
    const open = mobileNavOpen();
    const x = e.touches[0].clientX;
    if (!open && x > DRAWER_EDGE) return;
    if (open && x > drawerWidth() + 24) return;
    st = { x: x, y: e.touches[0].clientY, open: open, decided: false, active: false, w: drawerWidth() };
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!st || !e.touches || !e.touches.length) return;
    const t0 = e.touches[0];
    const dx = t0.clientX - st.x;
    const dy = t0.clientY - st.y;
    if (!st.decided) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      const intent = edgeSwipeIntent({ startX: st.x, endX: t0.clientX, endY: t0.clientY, open: st.open, edge: DRAWER_EDGE, trigger: 10 });
      if (intent === "none") { st = null; return; }
      st.decided = true;
      st.active = true;
      st.w = drawerWidth();
      if (intent === "open") setMobileNav(true);
      document.body.classList.add("mobile-nav-dragging");
    }
    if (!st.active) return;
    if (e.cancelable) e.preventDefault();
    const w = st.w;
    const tx = st.open ? Math.max(-w, Math.min(0, dx)) : Math.min(0, Math.max(-w, dx - w));
    sidebar.style.transform = "translateX(" + tx + "px)";
  }, { passive: false });
  const finish = (e) => {
    if (!st || !st.active) { st = null; return; }
    const t0 = (e.changedTouches && e.changedTouches[0]) || null;
    const dx = t0 ? t0.clientX - st.x : 0;
    const progress = st.open ? Math.min(1, Math.max(0, -dx / st.w)) : Math.min(1, Math.max(0, dx / st.w));
    document.body.classList.remove("mobile-nav-dragging");
    setMobileNav(progress > 0.4);
    sidebar.style.transform = "";
    st = null;
  };
  document.addEventListener("touchend", finish, { passive: true });
  document.addEventListener("touchcancel", finish, { passive: true });
})();

/* ============ 移动端：向下滚动自动收起顶栏，向上/回顶显示 ============ */
/* 顶栏在移动端改为「覆盖式」（position:absolute），只做 transform 位移，不再
   改变布局高度 —— 因此不会在收起/展开时触发滚动回流而抽疯。 */
(function initAutoHideTopbar() {
  const box = document.getElementById("messages");
  const topbar = document.querySelector(".topbar");
  if (!box || !topbar || !box.addEventListener || !topbar.style) return;
  const root = document.documentElement;
  const isMobile = () => { try { return window.innerWidth <= 820; } catch (e) { return false; } };

  const measure = () => {
    if (!isMobile()) { root.style.removeProperty("--topbar-h"); return; }
    const h = topbar.offsetHeight || 0;
    if (h > 0) root.style.setProperty("--topbar-h", Math.round(h) + "px");
  };

  let hidden = false;
  const setHidden = (want) => {
    if (!isMobile()) want = false;
    if (want === hidden) return;
    hidden = !!want;
    document.body.classList.toggle("hide-topbar", hidden);
    measure();
  };
  window.__ocShowTopbar = () => setHidden(false);

  let anchor = 0;
  let lockUntil = 0;
  box.addEventListener("scroll", () => {
    if (!isMobile()) { setHidden(false); return; }
    const now = Date.now();
    const y = box.scrollTop || 0;
    if (now < lockUntil) { anchor = y; return; }
    if (y <= 16) { anchor = y; setHidden(false); return; }
    const dy = y - anchor;
    if (dy > 40) { setHidden(true); anchor = y; lockUntil = now + 260; }
    else if (dy < -40) { setHidden(false); anchor = y; lockUntil = now + 260; }
  }, { passive: true });
  window.addEventListener("resize", () => { measure(); if (!isMobile()) setHidden(false); });
  window.addEventListener("orientationchange", () => setTimeout(measure, 250));
  document.addEventListener("focusin", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) setHidden(false);
  });
  try {
    if (window.ResizeObserver) new ResizeObserver(() => measure()).observe(topbar);
  } catch (e) { /* ignore */ }
  measure();
  setTimeout(measure, 300);
})();

/* ============ 移动端「更多」二级菜单 ============ */
(function initMobileMoreMenu() {
  const btn = $("mobileMoreBtn");
  const mask = $("mobileMoreMask");
  if (!btn || !mask) return;
  const isRemoteMode = () => document.body.classList.contains("remote-mode");
  const isAndroid = () => (typeof isAndroidApp === "function") && isAndroidApp();
  const open = () => {
    const show = (id, on) => { const it = $(id); if (it) it.style.display = on ? "" : "none"; };
    show("mmMedia", true);
    show("mmFiles", true);
    show("mmSearch", true);
    show("mmOutline", true);
    show("mmFullscreen", true);
    show("mmRestart", !isRemoteMode());
    show("mmAndroid", isAndroid());
    show("mmSettings", !isRemoteMode());
    show("mmLogout", isRemoteMode());
    mask.classList.add("show");
  };
  const close = () => mask.classList.remove("show");
  btn.onclick = open;
  const wire = (id, targetId) => {
    const item = $(id);
    if (item) item.onclick = () => { close(); const t = $(targetId); if (t) t.click(); };
  };
  wire("mmMedia", "mediaBtn");
  wire("mmFiles", "filesBtn");
  wire("mmSearch", "searchBtn");
  wire("mmOutline", "outlineBtn");
  wire("mmFullscreen", "fullscreenBtn");
  wire("mmRestart", "restartAppBtn");
  wire("mmAndroid", "nativeSettingsBtn");
  wire("mmSettings", "settingsBtn");
  wire("mmLogout", "remoteLogout");
  if ($("mmClose")) $("mmClose").onclick = close;
  mask.addEventListener("click", (e) => { if (e.target === mask) close(); });
})();

/* ============ 软键盘：让输入栏不被键盘遮挡 ============ */
/* WebView 在 edge-to-edge 下 adjustResize 不生效，键盘会盖住输入栏；这里用
   visualViewport 的高度动态设置 #app 高度（--app-h），使输入栏始终位于键盘上方。 */
(function initKeyboardView() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const isMobileLayout = () => {
    try { return window.innerWidth <= 820; } catch (e) { return true; }
  };
  const apply = () => {
    const full = window.innerHeight || root.clientHeight || 0;
    // APK 由原生 IME inset 直接把 WebView 缩上去（innerHeight 变小）；浏览器用
    // visualViewport 反映键盘。取两者较小值，两种路径都能得到可见高度。
    const vvH = (vv && vv.height) ? Math.round(vv.height) : full;
    const h = Math.round(Math.min(full || vvH, vvH));
    const kb = Math.max(0, full - h);
    root.style.setProperty("--kb", kb + "px");
    if (kb > 0 || isMobileLayout()) {
      if (h > 0) root.style.setProperty("--app-h", h + "px");
    } else {
      root.style.removeProperty("--app-h");
    }
    if (kb > 80) {
      // 键盘弹出时，确保页面回到顶部（避免视觉视口偏移导致顶栏被顶飞）。
      requestAnimationFrame(() => { try { window.scrollTo(0, 0); } catch (e) { /* ignore */ } });
    }
  };
  apply();
  if (vv && vv.addEventListener) {
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
  }
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", () => setTimeout(apply, 250));
  document.addEventListener("focusin", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) setTimeout(apply, 250);
  });
  document.addEventListener("focusout", () => setTimeout(apply, 60));
})();

