/* ============ 设置弹窗 ============ */
const settingsMask = $("settingsMask");
/* ============ 我的资料（左下角） ============ */
const profileMask = $("profileMask");
function renderUserAvatarPreview() {
  setAvatarContent($("userAvatarPreview"), userProfile().avatar, "", userProfile().name);
}
function renderUserBar() {
  const p = userProfile();
  setAvatarContent($("userBarAvatar"), p.avatar, "", p.name);
  $("userBarName").textContent = p.name || "你";
}
function refreshUserUI() {
  renderUserAvatarPreview();
  renderUserBar();
  refreshMessageRoles();
}
function openProfile() {
  $("userName").value = localStorage.getItem("oc_user_name") || "";
  refreshUserUI();
  profileMask.classList.add("show");
  setTimeout(() => $("userName").focus(), 30);
}
function closeProfile() { profileMask.classList.remove("show"); }

$("userBar").onclick = openProfile;
$("profileDone").onclick = closeProfile;
profileMask.addEventListener("click", (e) => { if (e.target === profileMask) closeProfile(); });
$("userName").addEventListener("input", () => {
  const v = $("userName").value.trim();
  if (v) localStorage.setItem("oc_user_name", v);
  else localStorage.removeItem("oc_user_name");
  refreshUserUI();
});
$("userAvatarBtn").onclick = () => pickImageDataUrl((d) => {
  localStorage.setItem("oc_user_avatar", d);
  refreshUserUI();
}, 160);
$("userAvatarClear").onclick = () => {
  localStorage.removeItem("oc_user_avatar");
  refreshUserUI();
};
renderUserBar();

$("settingsBtn").onclick = () => {
  settingsMask.classList.add("show");
  refreshUsageStats();
};
settingsMask.addEventListener("click", (e) => {
  if (e.target === settingsMask) settingsMask.classList.remove("show");
});

/* ============ Token 统计 ============ */
let showTokens = localStorage.getItem("oc_show_tokens") !== "0";

function fmtNum(n) { return Number(n || 0).toLocaleString("en-US"); }
function fmtCompact(n) {
  n = Number(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k";
  return String(n);
}
function costUnit() {
  return localStorage.getItem("oc_currency") || "$";
}
function fxRate() {
  const r = parseFloat(localStorage.getItem("oc_fx_rate"));
  return isFinite(r) && r > 0 ? r : 1;
}
function fmtCost(c) {
  c = Number(c || 0) * fxRate();
  if (!c) return "0";
  if (c < 0.01) return c.toFixed(4);
  return c.toFixed(3);
}
function tokenTotal(t) {
  if (!t) return 0;
  if (typeof t.total === "number") return t.total;
  return (t.input || 0) + (t.output || 0) + (t.reasoning || 0) +
    ((t.cache && t.cache.read) || 0) + ((t.cache && t.cache.write) || 0);
}
function applyTokenVisibility() {
  document.body.classList.toggle("no-tokens", !showTokens);
  const tg = $("tokenToggle");
  if (tg) tg.checked = showTokens;
}
/* ============ 回复用时计时器 ============ */
let durationTimer = null;

function fmtDurationMs(ms) {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + "s";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return m + "m" + String(r).padStart(2, "0") + "s";
}
function setDurationText(entry, text, live) {
  let el = entry.el.querySelector(".msg-duration");
  if (!el) {
    el = document.createElement("div");
    el.className = "msg-duration";
    const tokens = entry.el.querySelector(".msg-tokens");
    if (tokens) entry.el.insertBefore(el, tokens);
    else entry.el.appendChild(el);
  }
  el.textContent = "用时 " + text + (live ? "…" : "");
}
function tickDurations() {
  let activeStart = 0;
  for (const id in msgEls) {
    const entry = msgEls[id];
    if (!entry || !entry.genLive || entry.genDone || !entry.genStart) continue;
    setDurationText(entry, fmtDurationMs(Date.now() - entry.genStart), true);
    activeStart = entry.genStart;
  }
  const gt = $("genTimer");
  if (gt) {
    if (activeStart) {
      gt.textContent = "计时 " + fmtDurationMs(Date.now() - activeStart);
      gt.style.display = "";
    } else {
      gt.style.display = "none";
    }
  }
  if (!activeStart && durationTimer) { clearInterval(durationTimer); durationTimer = null; }
}
function ensureDurationTicker() {
  if (!durationTimer) durationTimer = setInterval(tickDurations, 100);
  tickDurations();
}
function updateDuration(info) {
  if (!info || info.role !== "assistant" || !info.time || !info.time.created) return;
  const entry = msgEls[info.id];
  if (!entry) return;
  entry.genStart = info.time.created;
  if (info.time.completed && info.time.completed >= info.time.created) {
    entry.genDone = true;
    entry.genLive = false;
    setDurationText(entry, fmtDurationMs(info.time.completed - info.time.created), false);
    tickDurations();
  } else {
    entry.genDone = false;
    if (busy) { entry.genLive = true; ensureDurationTicker(); }
  }
}
function finalizeDurations() {
  for (const id in msgEls) {
    const entry = msgEls[id];
    if (!entry || !entry.genLive || entry.genDone) continue;
    entry.genDone = true;
    entry.genLive = false;
    setDurationText(entry, fmtDurationMs(Date.now() - entry.genStart), false);
  }
  tickDurations();
}
function adoptLiveDurations() {
  let any = false;
  for (const id in msgEls) {
    const entry = msgEls[id];
    if (entry && entry.genStart && !entry.genDone) { entry.genLive = true; any = true; }
  }
  if (any) ensureDurationTicker();
}

function updateTokenBadge(info) {
  if (!info || info.role !== "assistant") return;
  const entry = msgEls[info.id];
  if (!entry) return;
  entry.info = info;
  updateDuration(info);
  const t = info.tokens;
  const has = t && (t.input || t.output || t.reasoning || (t.cache && (t.cache.read || t.cache.write)));
  let badge = entry.el.querySelector(".msg-tokens");
  if (!has) {
    if (badge) badge.remove();
    refreshSessionTokens();
    return;
  }
  if (!badge) {
    badge = el("div", "msg-tokens");
    entry.el.appendChild(badge);
  }
  const cr = (t.cache && t.cache.read) || 0;
  const cw = (t.cache && t.cache.write) || 0;
  const bits = ["Σ " + fmtNum(tokenTotal(t)), "↑ " + fmtNum(t.input || 0), "↓ " + fmtNum(t.output || 0)];
  if (t.reasoning) bits.push("思考 " + fmtNum(t.reasoning));
  if (cr) bits.push("缓存读 " + fmtNum(cr));
  if (cw) bits.push("缓存写 " + fmtNum(cw));
  if (info.cost) bits.push(costUnit() + fmtCost(info.cost));
  badge.textContent = bits.join(" · ");
  badge.title = "输入 " + fmtNum(t.input || 0) + "，输出 " + fmtNum(t.output || 0) +
    "，思考 " + fmtNum(t.reasoning || 0) + "，缓存读 " + fmtNum(cr) + "，缓存写 " + fmtNum(cw) +
    (info.cost ? "，费用 " + costUnit() + fmtCost(info.cost) : "");
  refreshSessionTokens();
}
function refreshSessionTokens() {
  const node = $("sessionTokens");
  if (!node) return;
  let input = 0, output = 0, reasoning = 0, cr = 0, cw = 0, cost = 0, any = false;
  for (const id in msgEls) {
    const info = msgEls[id] && msgEls[id].info;
    if (!info || info.role !== "assistant" || !info.tokens) continue;
    const t = info.tokens;
    input += t.input || 0; output += t.output || 0; reasoning += t.reasoning || 0;
    cr += (t.cache && t.cache.read) || 0; cw += (t.cache && t.cache.write) || 0;
    cost += info.cost || 0; any = true;
  }
  if (!any) { node.textContent = ""; updateCtxRing(); return; }
  const total = input + output + reasoning + cr + cw;
  node.textContent = "Σ " + fmtCompact(total) + " tok · ↑" + fmtCompact(input) + " ↓" + fmtCompact(output) +
    (cost ? " · " + costUnit() + fmtCost(cost) : "");
  node.title = "本会话累计：输入 " + fmtNum(input) + "，输出 " + fmtNum(output) +
    "，思考 " + fmtNum(reasoning) + "，缓存读 " + fmtNum(cr) + "，缓存写 " + fmtNum(cw) +
    (cost ? "，费用 " + costUnit() + fmtCost(cost) : "");
  updateCtxRing();
}
const CTX_RING_R = 9;
const CTX_RING_C = 2 * Math.PI * CTX_RING_R;
function latestAssistantInfo() {
  let best = null, bestT = 0;
  for (const id in msgEls) {
    const info = msgEls[id] && msgEls[id].info;
    if (!info || info.role !== "assistant" || !info.tokens) continue;
    const t = (info.time && info.time.created) || 0;
    if (!best || t >= bestT) { best = info; bestT = t; }
  }
  return best;
}
function contextStats() {
  let input = 0, output = 0, reasoning = 0, cr = 0, cw = 0, cost = 0, any = false;
  for (const id in msgEls) {
    const info = msgEls[id] && msgEls[id].info;
    if (!info || info.role !== "assistant" || !info.tokens) continue;
    const t = info.tokens;
    input += t.input || 0; output += t.output || 0; reasoning += t.reasoning || 0;
    cr += (t.cache && t.cache.read) || 0; cw += (t.cache && t.cache.write) || 0;
    cost += info.cost || 0; any = true;
  }
  const last = latestAssistantInfo();
  const lt = last ? last.tokens : null;
  const used = lt ? (lt.input || 0) + ((lt.cache && lt.cache.read) || 0) + (lt.output || 0) + (lt.reasoning || 0) : 0;
  const m = findModel(currentModelRef());
  const limit = (m && m.limit && m.limit.context) ? m.limit.context : 0;
  return { input, output, reasoning, cr, cw, cost, any, used, limit };
}
function renderCtxPop(s) {
  const pop = $("ctxPop");
  if (!pop) return;
  const m = findModel(currentModelRef());
  pop.innerHTML = "";
  pop.appendChild(el("div", "ctx-head", "本会话用量"));
  const rows = [];
  rows.push(["模型", (m && (m.name || m.id)) || "—"]);
  rows.push(["上下文", (s.limit > 0 ? fmtNum(s.used) + " / " + fmtNum(s.limit) : fmtNum(s.used) + " / 未知")]);
  if (s.limit > 0) {
    const ratio = Math.min(1, s.used / s.limit);
    rows.push(["剩余", fmtNum(Math.max(0, s.limit - s.used)) + "（" + Math.round((1 - ratio) * 100) + "%）"]);
  }
  rows.push(["输入", fmtNum(s.input)]);
  rows.push(["输出", fmtNum(s.output)]);
  if (s.reasoning) rows.push(["思考", fmtNum(s.reasoning)]);
  if (s.cr) rows.push(["缓存读", fmtNum(s.cr)]);
  if (s.cw) rows.push(["缓存写", fmtNum(s.cw)]);
  if (s.cost) rows.push(["费用", costUnit() + fmtCost(s.cost)]);
  for (const r of rows) {
    const row = el("div", "ctx-row");
    row.appendChild(el("span", "ctx-sub", r[0]));
    row.appendChild(el("span", null, r[1]));
    pop.appendChild(row);
  }
  const hint = el("div", "ctx-sub", "上下文≈最近一次的 输入+缓存读+输出");
  hint.style.marginTop = "6px";
  pop.appendChild(hint);
}
function updateCtxRing() {
  const ring = $("ctxRing");
  const arc = $("ctxRingArc");
  if (!ring || !arc) return;
  const s = contextStats();
  let ratio = 0, color = "var(--accent)";
  if (s.limit > 0 && s.used > 0) {
    ratio = Math.min(1, s.used / s.limit);
    if (ratio >= 0.9) color = "#d93025"; else if (ratio >= 0.7) color = "#f0a020";
  }
  arc.style.stroke = color;
  arc.style.strokeDasharray = CTX_RING_C.toFixed(2);
  arc.style.strokeDashoffset = (CTX_RING_C * (1 - ratio)).toFixed(2);
  ring.title = s.limit > 0
    ? "上下文 " + fmtNum(s.used) + " / " + fmtNum(s.limit) + "（" + Math.round(ratio * 100) + "%）"
    : (s.any ? "上下文用量 " + fmtNum(s.used) + "（窗口未知）" : "上下文窗口用量");
  const pop = $("ctxPop");
  if (pop && !pop.hidden) renderCtxPop(s);
}
function toggleCtxPop() {
  const pop = $("ctxPop");
  if (!pop) return;
  if (!pop.hidden) { pop.hidden = true; return; }
  renderCtxPop(contextStats());
  pop.hidden = false;
  const r = $("ctxRing").getBoundingClientRect();
  pop.style.top = (r.bottom + 6) + "px";
  const w = pop.offsetWidth || 240;
  pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px";
}
if ($("ctxRing")) {
  $("ctxRing").addEventListener("click", (e) => { e.stopPropagation(); toggleCtxPop(); });
}
document.addEventListener("click", (e) => {
  const pop = $("ctxPop");
  const ring = $("ctxRing");
  if (!pop || pop.hidden) return;
  if (pop.contains(e.target)) return;
  if (ring && (e.target === ring || ring.contains(e.target))) return;
  pop.hidden = true;
});

function fmtDateTime(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return ""; }
}

async function refreshUsageStats() {
  const box = $("usageStats");
  if (!box) return;
  box.innerHTML = '<div class="usage-empty">加载中…</div>';
  const items = [];
  await Promise.all((S.assistants || []).map(async (a) => {
    try {
      const list = await api("/session", { directory: a.directory });
      const target = normDir(a.directory);
      for (const s of (Array.isArray(list) ? list : [])) {
        if (normDir(s.directory) !== target) continue;
        items.push({ s: s, a: a });
      }
    } catch (e) { /* ignore */ }
  }));
  renderUsageStats(items);
}

function renderUsageStats(items) {
  const box = $("usageStats");
  if (!box) return;
  box.innerHTML = "";
  if (!items.length) { box.appendChild(el("div", "usage-empty", "暂无用量数据")); return; }
  const tot = { input: 0, output: 0, reasoning: 0, cr: 0, cw: 0, cost: 0 };
  for (const it of items) {
    const t = it.s.tokens || {};
    tot.input += t.input || 0; tot.output += t.output || 0; tot.reasoning += t.reasoning || 0;
    tot.cr += (t.cache && t.cache.read) || 0; tot.cw += (t.cache && t.cache.write) || 0;
    tot.cost += it.s.cost || 0;
  }
  const grid = el("div", "usage-grid");
  const cells = [
    ["总 Token", fmtNum(tot.input + tot.output + tot.reasoning + tot.cr + tot.cw)],
    ["输入", fmtNum(tot.input)],
    ["输出", fmtNum(tot.output)],
    ["思考", fmtNum(tot.reasoning)],
    ["缓存读", fmtNum(tot.cr)],
    ["缓存写", fmtNum(tot.cw)],
    ["费用", costUnit() + fmtCost(tot.cost)],
    ["会话数", fmtNum(items.length)],
  ];
  for (const cell of cells) {
    const c = el("div", "usage-cell");
    c.appendChild(el("div", "usage-cell-v", cell[1]));
    c.appendChild(el("div", "usage-cell-k", cell[0]));
    grid.appendChild(c);
  }
  box.appendChild(grid);

  items.sort((x, y) => (((y.s.time && y.s.time.updated) || 0) - ((x.s.time && x.s.time.updated) || 0)));
  const list = el("div", "usage-list");
  for (const it of items) {
    const s = it.s, a = it.a;
    const row = el("div", "usage-row");
    const left = el("div", "usage-row-main");
    left.appendChild(el("div", "usage-row-title", s.title || s.id));
    left.appendChild(el("div", "usage-row-sub", (a.name || "未命名") + " · " + fmtDateTime((s.time && s.time.updated) || (s.time && s.time.created))));
    row.appendChild(left);
    const right = el("div", "usage-row-num");
    right.appendChild(el("div", "usage-row-tok", fmtNum(tokenTotal(s.tokens)) + " tok"));
    right.appendChild(el("div", "usage-row-cost", costUnit() + fmtCost(s.cost || 0)));
    row.appendChild(right);
    row.onclick = () => {
      settingsMask.classList.remove("show");
      if (a.id !== S.activeId) activateAssistant(a.id, { sessionId: s.id });
      else selectSession(s.id);
    };
    list.appendChild(row);
  }
  box.appendChild(list);
}

$("tokenToggle").onchange = (e) => {
  showTokens = e.target.checked;
  localStorage.setItem("oc_show_tokens", showTokens ? "1" : "0");
  applyTokenVisibility();
};
$("usageRefresh").onclick = refreshUsageStats;
applyTokenVisibility();

