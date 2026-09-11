/* ============ 事件流 ============ */
function handleEvent(evt) {
  const p = evt.properties || {};
  if (evt.type === "permission.asked") { handlePermission(p); return; }
  if (evt.type === "question.asked") { handleQuestion(p); return; }
  const esid = p.sessionID || (p.info && p.info.sessionID) || (p.part && p.part.sessionID) || null;
  if (esid && (!currentSession || esid !== currentSession.id)) return;

  switch (evt.type) {
    case "message.updated": {
      if (p.info) { const holder = ensureMessageEl(p.info); updateTokenBadge(p.info); renderMessageError(holder, p.info); }
      break;
    }
    case "message.part.updated": {
      const part = p.part;
      if (!part) break;
      const el = ensurePartEl(part);
      if (el) {
        if (part.type === "text") {
          const owner = msgEls[part.messageID];
          if ((owner && owner.role === "user") || (part.text && PURE_STAMP_RE.test(part.text))) {
            applyUserStamp(el, part.text || "");
          } else {
            el.__raw = part.text || "";
            el.textContent = el.__raw;
          }
        } else if (part.type === "reasoning") {
          el.__raw = part.text || "";
          el.textContent = el.__raw;
          stickReasoning(el);
        } else if (part.type === "tool") {
          updateTool(el, part);
        }
      }
      break;
    }
    case "message.part.delta": {
      const el = partEls[p.partID];
      if (el && p.field === "text") {
        el.__raw = (el.__raw || "") + (p.delta || "");
        el.textContent = el.__raw;
        if (el.classList && el.classList.contains("reasoning")) stickReasoning(el);
        scrollBottom();
      }
      break;
    }
    case "session.status": {
      setBusy(p.status && p.status.type === "busy");
      break;
    }
    case "session.idle": {
      setBusy(false);
      finalizeMarkdown();
      setupAllVersionNavs();
      break;
    }
    case "question.replied":
    case "question.rejected": {
      const req = pendingQuestions.find(q => q.id === p.requestID);
      if (req) {
        const callID = req.tool && req.tool.callID;
        questionResultByCall[callID] = evt.type === "question.replied"
          ? { answers: p.answers || [] }
          : { rejected: true };
        delete questionByCall[callID];
        pendingQuestions = pendingQuestions.filter(q => q.id !== p.requestID);
        const tEl = questionToolEl(callID);
        if (tEl && tEl.__part) updateTool(tEl, tEl.__part);
      }
      break;
    }
    case "session.updated": {
      const info = p.info;
      if (info && sessionsCache.some(s => s.id === info.id)) {
        const s = sessionsCache.find(s => s.id === info.id);
        s.title = info.title || s.title;
        renderSessions(sessionsCache);
      }
      break;
    }
    case "session.deleted": {
      const info = p.info;
      if (info && sessionsCache.some(s => s.id === info.id)) {
        dropDraft(info.id);
        sessionsCache = sessionsCache.filter(s => s.id !== info.id);
        renderSessions(sessionsCache);
      }
      break;
    }
  }
  markLastAssistant();
  updateScrollBottom();
}

function finalizeMarkdown() {
  document.querySelectorAll(".msg .bubble").forEach(b => {
    if (window.marked) renderMarkdown(b, b.__raw !== undefined ? b.__raw : b.textContent);
  });
}

async function handlePermission(p) {
  if (!p.__dir) {
    if (currentSession && p.sessionID === currentSession.id) {
      p.__dir = activeDir;
    } else {
      try {
        const s = await api("/session/" + p.sessionID, { noDir: true });
        p.__dir = s.directory || activeDir;
      } catch (e) { p.__dir = activeDir; }
    }
  }
  pendingPerms.push(p);
  if (pendingPerms.length === 1) showPermModal();
}

function showPermModal() {
  const p = pendingPerms[0];
  if (!p) return;
  $("permDetail").innerHTML = "agent 请求权限：<code>" + escapeHtml(p.permission || "") + "</code>";
  const pats = (p.patterns || []).map(escapeHtml).join("<br>");
  const meta = p.sessionID ? '<div style="margin-top:6px">会话：' + escapeHtml(p.sessionID) + "</div>" : "";
  $("permPatterns").innerHTML = pats + meta;
  $("permMask").classList.add("show");
}
function hidePermModal() { $("permMask").classList.remove("show"); }

async function replyPerm(response) {
  const p = pendingPerms[0];
  if (!p) return;
  pendingPerms.shift();
  hidePermModal();
  try {
    await api("/session/" + p.sessionID + "/permissions/" + p.id, {
      method: "POST",
      directory: p.__dir || activeDir,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
  } catch (e) { console.error(e); }
  if (pendingPerms.length) showPermModal();
}
$("permOnce").onclick = () => replyPerm("once");
$("permAlways").onclick = () => replyPerm("always");
$("permReject").onclick = () => replyPerm("reject");

/* ============ 提问（question 工具） ============ */
function questionToolEl(callID) {
  let fallback = null;
  for (const t of document.querySelectorAll(".tool")) {
    const p = t.__part;
    if (!p || p.tool !== "question") continue;
    if (callID) {
      if (t.dataset.call === callID) return t;
    } else {
      fallback = t;
    }
  }
  return fallback;
}

async function handleQuestion(p) {
  if (!p.__dir) {
    if (currentSession && p.sessionID === currentSession.id) {
      p.__dir = activeDir;
    } else {
      try {
        const s = await api("/session/" + p.sessionID, { noDir: true });
        p.__dir = s.directory || activeDir;
      } catch (e) { p.__dir = activeDir; }
    }
  }
  const callID = p.tool && p.tool.callID;
  if (callID) questionByCall[callID] = p;
  if (!pendingQuestions.some(q => q.id === p.id)) pendingQuestions.push(p);
  const tEl = questionToolEl(callID);
  if (tEl && tEl.__part) {
    updateTool(tEl, tEl.__part);
    tEl.open = true;
    tEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function questionComplete(req, questions) {
  for (let i = 0; i < questions.length; i++) {
    const c = (req.__custom && req.__custom[i] || "").trim();
    if ((req.__sel[i] || []).length || c) continue;
    return false;
  }
  return true;
}

function syncQuestionBtns(box, req, questions) {
  let idx = 0;
  for (let qi = 0; qi < questions.length; qi++) {
    const arr = req.__sel[qi] || [];
    for (const opt of questions[qi].options || []) {
      const b = box.querySelectorAll(".q-opt")[idx++];
      if (b) b.classList.toggle("selected", arr.includes(opt.label));
    }
  }
  if (box.__submit) box.__submit.disabled = !questionComplete(req, questions);
}

function buildAnswers(req, questions) {
  return questions.map((q, i) => {
    const arr = (req.__sel[i] || []).slice();
    const c = (req.__custom && req.__custom[i] || "").trim();
    if (c) arr.push(c);
    return arr;
  });
}

async function finishQuestion(req, answers, isReply) {
  const callID = (req.tool && req.tool.callID) || "";
  questionResultByCall[callID] = isReply ? { answers: answers } : { rejected: true };
  delete questionByCall[callID];
  pendingQuestions = pendingQuestions.filter(q => q.id !== req.id);
  const tEl = questionToolEl(callID);
  if (tEl && tEl.__part) updateTool(tEl, tEl.__part);
  try {
    if (isReply) {
      await api("/question/" + req.id + "/reply", {
        method: "POST",
        directory: req.__dir || activeDir,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
    } else {
      await api("/question/" + req.id + "/reject", {
        method: "POST",
        directory: req.__dir || activeDir,
      });
    }
  } catch (e) {
    appendNotice("回答问题失败：" + e.message, true);
  }
}

function renderQuestion(body, part) {
  const st = part.state || {};
  const inp = st.input || {};
  const callID = part.callID || "";
  const req = questionByCall[callID];
  const result = questionResultByCall[callID];
  const questions = (inp.questions && inp.questions.length ? inp.questions : (req && req.questions)) || [];
  if (!questions.length) {
    if (st.output) body.appendChild(toolCode(String(st.output)));
    else body.appendChild(el("div", "tool-section-label", "等待问题…"));
    return;
  }
  const interactive = !!(req && !result);
  if (req && !req.__sel) req.__sel = questions.map(() => []);
  const sel = (req && req.__sel) || questions.map((q, i) => (result && result.answers && result.answers[i]) || []);

  const box = el("div", "q-box");
  questions.forEach((q, qi) => {
    const item = el("div", "q-item");
    if (q.header) item.appendChild(el("div", "q-header", q.header));
    if (q.question) item.appendChild(el("div", "q-text", q.question));
    const opts = el("div", "q-opts");
    for (const opt of q.options || []) {
      const chosenNow = (sel[qi] || []).includes(opt.label);
      const btn = el("button", "q-opt" + (chosenNow ? " selected" : ""));
      btn.type = "button";
      btn.appendChild(el("span", "q-opt-label", opt.label || ""));
      if (opt.description) btn.appendChild(el("span", "q-opt-desc", opt.description));
      if (interactive) {
        btn.onclick = () => {
          const arr = req.__sel[qi];
          if (q.multiple) {
            const i = arr.indexOf(opt.label);
            if (i >= 0) arr.splice(i, 1); else arr.push(opt.label);
          } else {
            req.__sel[qi] = [opt.label];
          }
          syncQuestionBtns(box, req, questions);
        };
      } else {
        btn.disabled = true;
      }
      opts.appendChild(btn);
    }
    item.appendChild(opts);
    if (interactive && q.custom) {
      const ta = document.createElement("textarea");
      ta.className = "q-custom";
      ta.placeholder = "或输入自定义回答…";
      ta.rows = 1;
      ta.value = (req.__custom && req.__custom[qi]) || "";
      ta.oninput = () => {
        if (!req.__custom) req.__custom = [];
        req.__custom[qi] = ta.value;
        syncQuestionBtns(box, req, questions);
      };
      item.appendChild(ta);
    }
    box.appendChild(item);
  });

  if (interactive) {
    const actions = el("div", "q-actions");
    const reject = el("button", "q-reject", "跳过");
    reject.type = "button";
    reject.onclick = () => finishQuestion(req, [], false);
    const submit = el("button", "q-submit", "提交");
    submit.type = "button";
    submit.disabled = !questionComplete(req, questions);
    submit.onclick = () => finishQuestion(req, buildAnswers(req, questions), true);
    actions.append(reject, submit);
    box.appendChild(actions);
    box.__submit = submit;
  } else if (result && result.rejected) {
    box.appendChild(el("div", "q-result", "已跳过该问题"));
  } else if (result && result.answers) {
    const chosen = [];
    result.answers.forEach(a => (a || []).forEach(l => chosen.push(l)));
    const ans = el("div", "q-result");
    ans.appendChild(el("span", "", "已选择："));
    ans.appendChild(el("span", "q-chosen", chosen.join("、") || "（空）"));
    box.appendChild(ans);
  } else if (st.output) {
    box.appendChild(el("div", "tool-section-label", "结果"));
    box.appendChild(toolCode(String(st.output)));
  } else {
    box.appendChild(el("div", "q-result", "等待回答…"));
  }
  body.appendChild(box);
}

function setBusy(b) {
  if (!b) finalizeDurations();
  busy = b;
  sendBtn.disabled = b || !currentSession;
  stopBtn.disabled = !b;
  if (typeof updateSendState === "function") updateSendState();
  document.querySelectorAll(".regen-btn").forEach(x => { x.disabled = b; });
  document.querySelectorAll(".live-dot").forEach(d => d.classList.toggle("busy", !!b));
  document.querySelectorAll(".cursor").forEach(c => c.remove());
  if (b) {
    adoptLiveDurations();
    const c = document.createElement("span");
    c.className = "cursor";
    messagesEl.appendChild(c);
    scrollBottom(true);
  } else {
    markLastAssistant();
  }
}

let autoScroll = true;
function nearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
}
function scrollBottom(force) {
  if (force || autoScroll) messagesEl.scrollTop = messagesEl.scrollHeight;
  if (typeof updateScrollBottom === "function") updateScrollBottom();
}
function stickReasoning(el) {
  if (el && el.__stick !== false) el.scrollTop = el.scrollHeight;
}

function connectEvents() {
  if (eventSource && eventsDir === activeDir) return;
  if (eventSource) { eventSource.close(); eventSource = null; }
  eventsDir = activeDir;
  const qs = activeDir ? "?directory=" + encodeURIComponent(activeDir) : "";
  const tok = window.__OC_TOKEN ? (qs ? "&" : "?") + "token=" + encodeURIComponent(window.__OC_TOKEN) : "";
  const url = "/api/event" + qs + tok;
  eventSource = new EventSource(url);
  eventSource.onmessage = (e) => {
    try { handleEvent(JSON.parse(e.data)); } catch (err) { console.error(err); }
  };
}

function closeEvents() {
  if (eventSource) { eventSource.close(); eventSource = null; }
  eventsDir = null;
}

