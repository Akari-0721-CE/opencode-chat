/* ============ 消息渲染 ============ */
const MATH_RE = /(?:\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?:[^\s$][^$\n]*?[^\s$]|[^\s$])\$)/g;
const CODE_TOKEN = (i) => "\uE000" + i + "\uE001";
const MATH_TOKEN = (i) => "\uE002" + i + "\uE003";

function protectSegments(text, re, store, makeToken) {
  return String(text).replace(re, (m) => {
    const token = makeToken(store.length);
    store.push(m);
    return token;
  });
}

function restoreCode(html, store) {
  if (!store.length) return html;
  return html.replace(/\uE000(\d+)\uE001/g, (m, i) => {
    const raw = store[+i] || "";
    if (raw.startsWith("```") || raw.startsWith("~~~")) {
      let body = raw.slice(3, -3);
      if (body.startsWith("\r\n")) body = body.slice(2);
      else if (body.startsWith("\n")) body = body.slice(1);
      let lang = "";
      const nl = body.indexOf("\n");
      if (nl >= 0) { lang = body.slice(0, nl).trim(); body = body.slice(nl + 1); }
      const cls = lang ? ' class="language-' + escapeHtml(lang) + '"' : "";
      return "<pre><code" + cls + ">" + escapeHtml(body) + "</code></pre>";
    }
    return "<code>" + escapeHtml(raw.slice(1, -1)) + "</code>";
  });
}

function katexHtml(token) {
  if (!window.katex) return escapeHtml(token);
  let tex = token;
  let displayMode = false;
  if (tex.startsWith("$$")) { tex = tex.slice(2, -2); displayMode = true; }
  else if (tex.startsWith("\\[")) { tex = tex.slice(2, -2); displayMode = true; }
  else if (tex.startsWith("\\(")) { tex = tex.slice(2, -2); }
  else if (tex.startsWith("$")) { tex = tex.slice(1, -1); }
  try {
    return window.katex.renderToString(tex, { displayMode: displayMode, throwOnError: false });
  } catch (e) {
    return escapeHtml(token);
  }
}

function restoreMath(html, store) {
  if (!store.length) return html;
  return html.replace(/\uE002(\d+)\uE003/g, (m, i) => katexHtml(store[+i] || ""));
}

const SANITIZE_OPTS = {
  ADD_TAGS: [
    "math", "semantics", "annotation", "mrow", "mi", "mn", "mo", "msup", "msub", "msubsup",
    "mfrac", "msqrt", "mroot", "mstyle", "mtext", "mspace", "munder", "mover", "munderover",
    "mtable", "mtr", "mtd", "mlabeledtr", "mpadded", "mphantom", "menclose",
    "mmultiscripts", "mprescripts", "none", "mglyph",
  ],
  ADD_ATTR: ["encoding", "display", "mathvariant", "stretchy", "d", "viewBox", "xmlns"],
};

function sanitizeHtml(html) {
  if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
    return window.DOMPurify.sanitize(html, SANITIZE_OPTS);
  }
  return null;
}

function renderMarkdown(el, text) {
  const src0 = text == null ? "" : String(text);
  const codeStore = [];
  const mathStore = [];
  let src = protectSegments(src0, /```[\s\S]*?```|~~~[\s\S]*?~~~/g, codeStore, CODE_TOKEN);
  src = protectSegments(src, /`[^`\n]+`/g, codeStore, CODE_TOKEN);
  src = protectSegments(src, MATH_RE, mathStore, MATH_TOKEN);
  if (window.marked) {
    try {
      const out = window.marked.parse(src);
      const finish = (html) => {
        const rebuilt = restoreMath(restoreCode(html, codeStore), mathStore);
        const clean = sanitizeHtml(rebuilt);
        if (clean === null) { el.textContent = src0; return; }
        el.innerHTML = clean;
        if (window.hljs) {
          el.querySelectorAll("pre code").forEach(b => { try { hljs.highlightElement(b); } catch (e) {} });
        }
      };
      if (out && typeof out.then === "function") out.then(finish).catch(() => { el.textContent = src0; });
      else finish(out);
      return;
    } catch (e) {}
  }
  el.textContent = src0;
}

function showPlaceholder(text) {
  messagesEl.innerHTML = "";
  const d = document.createElement("div");
  d.className = "placeholder";
  d.textContent = text;
  messagesEl.appendChild(d);
  if (typeof updateScrollBottom === "function") updateScrollBottom();
}

function appendNotice(text, isError) {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";
  const role = document.createElement("div");
  role.className = "role";
  role.textContent = isError ? "错误" : "提示";
  const bubble = document.createElement("div");
  bubble.className = "bubble notice" + (isError ? " error" : "");
  bubble.textContent = text;
  wrap.append(role, bubble);
  messagesEl.appendChild(wrap);
  scrollBottom(true);
}
function messageErrorText(info) {
  const e = info && info.error;
  if (!e) return "";
  if (typeof e === "string") return e;
  const d = e.data || {};
  const out = [];
  if (e.name) out.push(e.name);
  if (d.statusCode) out.push("[" + d.statusCode + "]");
  if (d.message) out.push(d.message);
  else if (d.responseBody) out.push(String(d.responseBody).slice(0, 300));
  return out.length ? out.join(" ") : String(JSON.stringify(e)).slice(0, 300);
}
function renderMessageError(holder, info) {
  if (!holder) return;
  const wrap = holder.el || holder;
  if (!wrap) return;
  let box = wrap.querySelector(".msg-error");
  const txt = messageErrorText(info);
  if (!txt) { if (box) box.remove(); return; }
  if (!box) { box = el("div", "bubble notice error msg-error"); wrap.appendChild(box); }
  box.textContent = "模型调用失败：" + txt;
}

function ensureMessageById(id) {
  if (msgEls[id]) return msgEls[id];
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";
  wrap.dataset.id = id;
  wrap.dataset.role = "assistant";
  const role = document.createElement("div");
  role.className = "role";
  fillRole(role, "assistant");
  wrap.appendChild(role);
  attachMessageActions(wrap, "assistant");
  messagesEl.appendChild(wrap);
  msgEls[id] = { el: wrap, role: "assistant" };
  return msgEls[id];
}

function ensureMessageEl(info) {
  const id = info.id;
  if (msgEls[id]) return msgEls[id];
  const wrap = document.createElement("div");
  wrap.className = "msg " + (info.role === "user" ? "user" : "assistant");
  wrap.dataset.id = id;
  wrap.dataset.role = info.role;
  const role = document.createElement("div");
  role.className = "role";
  fillRole(role, info.role);
  wrap.appendChild(role);
  attachMessageActions(wrap, info.role);
  messagesEl.appendChild(wrap);
  msgEls[id] = { el: wrap, role: info.role, info: info };
  return msgEls[id];
}

function attachMessageActions(wrap, role) {
  const actions = el("div", "msg-actions");
  const copy = el("button", "msg-action");
  copy.title = "复制";
  copy.appendChild(iconEl("copy"));
  copy.appendChild(document.createTextNode("复制"));
  copy.onclick = () => copyMessage(wrap, copy);
  actions.appendChild(copy);
  const fav = el("button", "msg-action fav-btn");
  fav.title = "收藏此消息";
  fav.onclick = () => toggleMessageFavorite(wrap, fav);
  setFavBtn(fav, !!(currentSession && findMessageFav(currentSession.id, wrap.dataset.id)));
  actions.appendChild(fav);
  if (role !== "user") {
    const regen = el("button", "msg-action regen-btn");
    regen.title = "重新生成";
    regen.appendChild(iconEl("refresh"));
    regen.appendChild(document.createTextNode("重新生成"));
    regen.style.display = "none";
    regen.onclick = () => regenerate(wrap.dataset.id);
    actions.appendChild(regen);
  } else {
    const edit = el("button", "msg-action");
    edit.title = "编辑并重发（会清除该消息之后的对话）";
    edit.appendChild(iconEl("pencil"));
    edit.appendChild(document.createTextNode("编辑"));
    edit.onclick = () => editUserMessage(wrap.dataset.id);
    actions.appendChild(edit);
  }
  wrap.appendChild(actions);
}

function messageRawText(wrap) {
  if (wrap.classList && wrap.classList.contains("show-ver-old")) {
    const old = wrap.querySelector(".bubble.ver-old");
    return old ? (old.__raw !== undefined ? old.__raw : old.textContent) : "";
  }
  const bubbles = wrap.querySelectorAll(".bubble:not(.ver-old)");
  return Array.from(bubbles).map(b => b.__raw !== undefined ? b.__raw : b.textContent).join("\n\n").trim();
}

async function copyMessage(wrap, btn) {
  const text = messageRawText(wrap);
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    const old = btn.lastChild;
    btn.lastChild.textContent = "已复制";
    setTimeout(() => { if (old) old.textContent = "复制"; }, 1200);
  } catch (e) {
    appendNotice("复制失败：" + e.message, true);
  }
}

function markLastAssistant() {
  const btns = document.querySelectorAll(".msg .regen-btn");
  btns.forEach(b => { b.style.display = "none"; });
  if (busy) return;
  const wraps = messagesEl.querySelectorAll(".msg.assistant");
  const last = wraps[wraps.length - 1];
  if (!last) return;
  const btn = last.querySelector(".regen-btn");
  if (btn) btn.style.display = "";
}

function ensurePartEl(part) {
  const id = part.id;
  if (partEls[id]) return partEls[id];
  const holder = ensureMessageById(part.messageID).el;
  let el = null;
  if (part.type === "reasoning") {
    const label = document.createElement("div");
    label.className = "reasoning-label";
    label.textContent = "思考";
    holder.appendChild(label);
    el = document.createElement("div");
    el.className = "reasoning";
    el.__stick = true;
    el.addEventListener("scroll", () => {
      el.__stick = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    });
    holder.appendChild(el);
  } else if (part.type === "text") {
    el = document.createElement("div");
    el.className = "bubble";
    holder.appendChild(el);
  } else if (part.type === "tool") {
    el = document.createElement("details");
    el.className = "tool";
    const summary = document.createElement("summary");
    el.appendChild(summary);
    const body = document.createElement("div");
    body.className = "tool-body";
    el.appendChild(body);
    holder.appendChild(el);
  } else if (part.type === "file") {
    const box = document.createElement("div");
    box.className = "msg-file";
    if (String(part.mime || "").startsWith("image/") && part.url) {
      const img = document.createElement("img");
      img.src = part.url;
      img.alt = part.filename || "image";
      box.appendChild(img);
    } else {
      const ico = document.createElement("div");
      ico.className = "file-ico";
      ico.appendChild(iconEl("file"));
      box.appendChild(ico);
    }
    const name = document.createElement("span");
    name.className = "a-name";
    name.textContent = part.filename || part.mime || "文件";
    box.appendChild(name);
    el = box;
    holder.appendChild(el);
  } else {
    return null;
  }
  partEls[id] = el;
  return el;
}

function toolSummaryText(part) {
  const t = part.tool;
  const inp = (part.state && part.state.input) || {};
  if (t === "bash") return inp.command || "";
  if (t === "read" || t === "write" || t === "edit") return inp.filePath || "";
  if (t === "glob" || t === "grep") return inp.pattern || "";
  if (t === "task") return inp.description || "";
  if (t === "webfetch") return inp.url || "";
  if (t === "todowrite") return inp.todos ? inp.todos.length + " 项" : "";
  if (t === "question") return (inp.questions && inp.questions[0] && inp.questions[0].header) || "";
  return "";
}

function fmtDuration(part) {
  const tm = part.state && part.state.time;
  if (!tm || !tm.start) return "";
  const ms = (tm.end || Date.now()) - tm.start;
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

function toolCode(text) {
  const pre = document.createElement("pre");
  pre.className = "tool-code";
  pre.textContent = text;
  return pre;
}

function renderDiff(container, patch) {
  const box = document.createElement("div");
  box.className = "diff";
  for (const line of String(patch).split("\n")) {
    let cls = "diff-line";
    if (line.startsWith("@@")) cls += " hunk";
    else if (line.startsWith("+")) cls += " add";
    else if (line.startsWith("-")) cls += " del";
    else if (line.startsWith("Index:") || line.startsWith("===") || line.startsWith("---") || line.startsWith("+++")) cls += " meta";
    const d = document.createElement("div");
    d.className = cls;
    d.textContent = line || " ";
    box.appendChild(d);
  }
  container.appendChild(box);
}

function renderBash(body, part) {
  const inp = (part.state && part.state.input) || {};
  const md = (part.state && part.state.metadata) || {};
  const box = document.createElement("div");
  box.className = "term";
  const cmd = document.createElement("div");
  cmd.className = "term-cmd";
  cmd.textContent = inp.command || "";
  const out = document.createElement("pre");
  out.className = "term-out";
  out.textContent = (part.state && part.state.output) || "";
  box.append(cmd, out);
  body.appendChild(box);
  const meta = document.createElement("div");
  meta.className = "term-meta";
  if (md.exit !== undefined) {
    const e = document.createElement("span");
    e.className = md.exit === 0 ? "" : "bad";
    e.textContent = "exit " + md.exit;
    meta.appendChild(e);
  }
  if (md.truncated) meta.appendChild(document.createTextNode("已截断"));
  if (meta.childNodes.length) body.appendChild(meta);
}

function renderRead(body, part) {
  const md = (part.state && part.state.metadata) || {};
  const disp = md.display;
  if (disp && disp.type === "directory") {
    const box = document.createElement("div");
    box.className = "dir-entries";
    for (const e of disp.entries || []) {
      const row = document.createElement("div");
      row.className = "dir-entry";
      row.textContent = e;
      box.appendChild(row);
    }
    body.appendChild(box);
    if (disp.truncated) body.appendChild(el("div", "tool-section-label", "（已截断）"));
    return;
  }
  let text = (part.state && part.state.output) || "";
  const m = text.match(/<content>\n?([\s\S]*?)\n?<\/content>/);
  if (m) text = m[1];
  body.appendChild(toolCode(text));
}

function renderWrite(body, part) {
  const inp = (part.state && part.state.input) || {};
  const md = (part.state && part.state.metadata) || {};
  body.appendChild(el("div", "tool-section-label", md.exists ? "已覆盖写入" : "新建文件"));
  if (inp.content !== undefined) {
    const lines = String(inp.content).split("\n");
    const shown = lines.slice(0, 60).join("\n");
    body.appendChild(toolCode(shown + (lines.length > 60 ? "\n…（共 " + lines.length + " 行）" : "")));
  }
}

function renderEdit(body, part) {
  const inp = (part.state && part.state.input) || {};
  const md = (part.state && part.state.metadata) || {};
  const fd = md.filediff;
  if (fd) {
    const stats = document.createElement("div");
    stats.className = "tool-stats";
    const add = document.createElement("span"); add.className = "add"; add.textContent = "+" + (fd.additions || 0);
    const del = document.createElement("span"); del.className = "del"; del.textContent = "-" + (fd.deletions || 0);
    stats.append(add, del);
    body.appendChild(stats);
    renderDiff(body, fd.patch || md.diff || "");
    return;
  }
  if (inp.oldString !== undefined) {
    const box = document.createElement("div");
    box.className = "diff";
    for (const line of String(inp.oldString).split("\n")) {
      const d = document.createElement("div"); d.className = "diff-line del"; d.textContent = "- " + line; box.appendChild(d);
    }
    for (const line of String(inp.newString).split("\n")) {
      const d = document.createElement("div"); d.className = "diff-line add"; d.textContent = "+ " + line; box.appendChild(d);
    }
    body.appendChild(box);
  }
  if (part.state && part.state.output) body.appendChild(el("div", "tool-section-label", part.state.output));
}

function renderTodos(body, part) {
  const inp = (part.state && part.state.input) || {};
  const list = document.createElement("ul");
  list.className = "todo-list";
  for (const t of inp.todos || []) {
    const li = document.createElement("li");
    li.className = "todo-item " + (t.status || "pending");
    const box = document.createElement("span");
    box.className = "box";
    box.textContent = t.status === "completed" ? "✓" : (t.status === "in_progress" ? "▸" : "");
    const txt = document.createElement("span");
    txt.className = "txt";
    txt.textContent = t.content || "";
    li.append(box, txt);
    if (t.priority && t.priority !== "medium") li.appendChild(el("span", "pri", t.priority));
    list.appendChild(li);
  }
  body.appendChild(list);
}

function renderGeneric(body, part) {
  const st = part.state || {};
  if (st.input && Object.keys(st.input).length) {
    body.appendChild(el("div", "tool-section-label", "输入"));
    body.appendChild(toolCode(JSON.stringify(st.input, null, 2)));
  }
  if (st.output) {
    body.appendChild(el("div", "tool-section-label", "输出"));
    body.appendChild(toolCode(String(st.output)));
  }
}

function updateTool(toolEl, part) {
  const summary = toolEl.querySelector("summary");
  const body = toolEl.querySelector(".tool-body");
  const st = (part.state && part.state.status) || "";
  if (part.callID) { toolEl.dataset.call = part.callID; toolEl.__part = part; }
  summary.innerHTML = "";
  summary.appendChild(el("span", "t-name", part.tool || "tool"));
  const title = toolSummaryText(part);
  if (title) summary.appendChild(el("span", "t-title", title));
  const dur = fmtDuration(part);
  if (dur) summary.appendChild(el("span", "t-dur", dur));
  if (st) {
    const badge = document.createElement("span");
    badge.className = "status " + st;
    badge.textContent = st;
    summary.appendChild(badge);
  }
  if ((st === "error" || st === "running") && toolEl.__lastStatus !== st) toolEl.open = true;
  toolEl.__lastStatus = st;

  body.innerHTML = "";
  if (st === "pending") return;
  if (st === "error" && part.state.error && !part.state.output && !(part.state.metadata && part.state.metadata.filediff)) {
    body.appendChild(toolCode(String(part.state.error)));
    return;
  }
  const t = part.tool;
  if (t === "bash") renderBash(body, part);
  else if (t === "read") renderRead(body, part);
  else if (t === "write") renderWrite(body, part);
  else if (t === "edit") renderEdit(body, part);
  else if (t === "todowrite") renderTodos(body, part);
  else if (t === "question") renderQuestion(body, part);
  else renderGeneric(body, part);

  for (const at of ((part.state && part.state.attachments) || [])) {
    if (String(at.mime || "").startsWith("image/") && at.url) {
      const im = document.createElement("img");
      im.className = "tool-image";
      im.src = at.url;
      im.alt = at.filename || "image";
      body.appendChild(im);
    }
  }

  if (st === "error" && part.state.error) {
    body.appendChild(el("div", "tool-section-label", "错误"));
    body.appendChild(toolCode(String(part.state.error)));
  }
}

function renderMessage(info, parts) {
  const holder = ensureMessageEl(info);
  updateTokenBadge(info);
  for (const part of parts || []) {
    if (part.type === "text") {
      const el = ensurePartEl(part);
      if (info.role === "user") { applyUserStamp(el, part.text || ""); }
      else { el.__raw = part.text || ""; renderMarkdown(el, el.__raw); }
    } else if (part.type === "reasoning") {
      const el = ensurePartEl(part);
      el.__raw = part.text || "";
      el.textContent = el.__raw;
    } else if (part.type === "tool") {
      const el = ensurePartEl(part);
      updateTool(el, part);
    } else if (part.type === "file") {
      ensurePartEl(part);
    }
  }
  renderMessageError(holder, info);
  if (info.role === "assistant") setupVersionNav(holder, precedingUserText(holder.el));
  return holder;
}
function precedingUserText(wrap) {
  let n = wrap ? wrap.previousElementSibling : null;
  while (n) {
    if (n.classList && n.classList.contains("msg") && n.classList.contains("user")) return messageRawText(n);
    n = n.previousElementSibling;
  }
  return "";
}

