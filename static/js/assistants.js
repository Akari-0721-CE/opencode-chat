/* ============ 助手 / 文件夹 树 ============ */
function renderTree() {
  treeEl.innerHTML = "";
  if (!S.assistants.length && !S.folders.length) {
    treeEl.appendChild(el("div", "tree-empty", "还没有助手，点击「新建助手」"));
    return;
  }
  const makeAssistantRow = (a) => {
    const row = el("div", "row" + (a.id === S.activeId ? " active" : ""));
    const av = el("span", "avatar");
    if (a.avatar) {
      const im = document.createElement("img");
      im.src = a.avatar;
      av.appendChild(im);
    } else {
      av.textContent = a.icon || (a.name || "助").trim().charAt(0);
      if (!a.icon) av.style.background = avatarColor(a.name || a.id);
    }
    row.appendChild(av);
    row.appendChild(el("span", "label", a.name || "未命名"));
    if (a.gitSafe) {
      const badge = el("span", "git-badge", "Git");
      badge.title = "已开启 Git 安全：commit/push 前需确认";
      row.appendChild(badge);
    }
    if (a.id === S.activeId) row.appendChild(el("span", "live-dot" + (busy ? " busy" : "")));
    row.title = (a.name || "") + "\n" + (a.directory || "") +
      (a.gitSafe ? "\nGit 安全：已开启" : "");

    const actions = el("div", "row-actions");
    const bFav = el("button", "mini-btn" + (a.favorite ? " fav-on" : ""));
    bFav.title = a.favorite ? "取消收藏" : "收藏";
    bFav.appendChild(iconEl(a.favorite ? "starFill" : "star"));
    bFav.onclick = (e) => { e.stopPropagation(); a.favorite = !a.favorite; saveStore(); renderTree(); };
    const bEdit = el("button", "mini-btn"); bEdit.title = "编辑"; bEdit.appendChild(iconEl("pencil"));
    bEdit.onclick = (e) => { e.stopPropagation(); openAssistantModal(a.id); };
    const bCopy = el("button", "mini-btn"); bCopy.title = "复制助手（不含对话）"; bCopy.appendChild(iconEl("copy"));
    bCopy.onclick = (e) => { e.stopPropagation(); duplicateAssistant(a.id); };
    const bDel = el("button", "mini-btn"); bDel.title = "删除"; bDel.appendChild(iconEl("trash"));
    bDel.onclick = (e) => { e.stopPropagation(); deleteAssistant(a.id); };
    actions.append(bFav, bEdit, bCopy, bDel);
    row.appendChild(actions);

    row.onclick = () => activateAssistant(a.id, { restore: true });
    return row;
  };

  const addAssistantRows = (container, folderId) => {
    S.assistants.filter(a => (a.folderId || null) === folderId)
      .sort((x, y) => (y.favorite ? 1 : 0) - (x.favorite ? 1 : 0))
      .forEach(a => container.appendChild(makeAssistantRow(a)));
  };

  for (const f of S.folders) {
    const wrap = el("div", "tree-folder" + (f.collapsed ? " collapsed" : ""));
    const row = el("div", "row");
    const chev = el("span", "chev"); chev.appendChild(iconEl("chevron"));
    const av = el("span", "avatar folder"); av.appendChild(iconEl("folder"));
    row.append(chev, av, el("span", "label", f.name || "文件夹"));

    const actions = el("div", "row-actions");
    const bAdd = el("button", "mini-btn"); bAdd.title = "在此新建助手"; bAdd.appendChild(iconEl("plus"));
    bAdd.onclick = (e) => { e.stopPropagation(); openAssistantModal(null, f.id); };
    const bEdit = el("button", "mini-btn"); bEdit.title = "重命名"; bEdit.appendChild(iconEl("pencil"));
    bEdit.onclick = (e) => { e.stopPropagation(); renameFolder(f.id); };
    const bDel = el("button", "mini-btn"); bDel.title = "删除文件夹（助手将移到顶层）"; bDel.appendChild(iconEl("trash"));
    bDel.onclick = (e) => { e.stopPropagation(); deleteFolder(f.id); };
    actions.append(bAdd, bEdit, bDel);
    row.appendChild(actions);

    row.onclick = () => { f.collapsed = !f.collapsed; saveStore(); renderTree(); };
    wrap.appendChild(row);
    const children = el("div", "children");
    addAssistantRows(children, f.id);
    wrap.appendChild(children);
    treeEl.appendChild(wrap);
  }
  addAssistantRows(treeEl, null);
}

/* ============ 文件夹 CRUD ============ */
let promptCancelFn = null;
function resetPromptInput() {
  const inp = $("promptInput");
  inp.value = "";
  inp.type = "text";
}
function openPrompt(title, value, onOk, onCancel, opts) {
  const inp = $("promptInput");
  inp.type = (opts && opts.secret) ? "password" : "text";
  inp.autocomplete = (opts && opts.secret) ? "new-password" : "off";
  $("promptTitle").textContent = title;
  inp.value = value || "";
  promptCancelFn = onCancel || null;
  $("promptMask").classList.add("show");
  setTimeout(() => inp.focus(), 30);
  $("promptOk").onclick = () => {
    const v = inp.value.trim();
    if (!v) return;
    const val = v;
    resetPromptInput();
    $("promptMask").classList.remove("show");
    onOk(val);
  };
}
$("promptCancel").onclick = () => {
  resetPromptInput();
  $("promptMask").classList.remove("show");
  if (promptCancelFn) { const f = promptCancelFn; promptCancelFn = null; f(); }
};
$("promptInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("promptOk").click(); }
});

function createFolder(onDone, onCancel) {
  openPrompt("新建文件夹", "", (name) => {
    const f = { id: uid("fld"), name, collapsed: false };
    S.folders.push(f);
    saveStore();
    renderTree();
    if (onDone) onDone(f);
  }, onCancel);
}
function renameFolder(id) {
  const f = S.folders.find(x => x.id === id);
  if (!f) return;
  openPrompt("重命名文件夹", f.name, (name) => {
    f.name = name;
    saveStore();
    renderTree();
  });
}
function deleteFolder(id) {
  const f = S.folders.find(x => x.id === id);
  if (!f) return;
  if (!confirm('删除文件夹「' + f.name + '」？其中的助手将移动到顶层。')) return;
  S.assistants.forEach(a => { if (a.folderId === id) a.folderId = null; });
  S.folders = S.folders.filter(x => x.id !== id);
  saveStore();
  renderTree();
}
$("newFolder").onclick = () => createFolder();

/* ============ 助手 CRUD ============ */
function populateFolderSelect(selected) {
  const sel = $("astFolder");
  sel.innerHTML = "";
  const none = el("option", null, "（无 / 顶层）"); none.value = "";
  sel.appendChild(none);
  for (const f of S.folders) {
    const o = el("option", null, f.name); o.value = f.id; sel.appendChild(o);
  }
  const nf = el("option", null, "＋ 新建文件夹…"); nf.value = "__new__";
  sel.appendChild(nf);
  sel.value = selected || "";
}
function populateAgentSelect(selected) {
  const sel = $("astAgent");
  sel.innerHTML = "";
  const list = agentsCache.length ? agentsCache : [{ name: "build", description: "" }, { name: "plan", description: "" }];
  for (const a of list) {
    const o = el("option", null, a.name + (a.description ? ("  ·  " + a.description.slice(0, 40)) : ""));
    o.value = a.name;
    sel.appendChild(o);
  }
  sel.value = selected || "build";
}
function populateModelSelect(selected) {
  const sel = $("astModel");
  sel.innerHTML = "";
  const none = el("option", null, "（默认）"); none.value = "";
  sel.appendChild(none);
  for (const prov of modelsByProvider) {
    const grp = document.createElement("optgroup");
    grp.label = prov.name || prov.id;
    for (const m of prov.models) {
      const o = el("option", null, m.name || m.id);
      o.value = modelKey(m.providerID, m.id);
      grp.appendChild(o);
    }
    sel.appendChild(grp);
  }
  sel.value = selected ? modelKey(selected.providerID, selected.id) : "";
}
function populateVariantSelect(selected) {
  const sel = $("astVariant");
  const val = $("astModel").value;
  let model = null;
  if (val) { model = parseModelKey(val); }
  else { model = fallbackModel(); }
  const variants = variantsOf(model);
  const withNone = modelReasoning(model);
  sel.innerHTML = "";
  const none = el("option", null, (variants.length || withNone) ? "（默认）" : "（当前模型不支持）");
  none.value = "";
  sel.appendChild(none);
  for (const v of variants) {
    const o = el("option", null, v); o.value = v; sel.appendChild(o);
  }
  if (withNone && variants.indexOf("none") < 0) {
    const o = el("option", null, "非思考"); o.value = "none"; sel.appendChild(o);
  }
  sel.disabled = !variants.length && !withNone;
  sel.value = (selected && (variants.indexOf(selected) >= 0 || (withNone && selected === "none"))) ? selected : "";
}
$("astModel").addEventListener("change", () => populateVariantSelect(null));
$("astFolder").onchange = () => {
  if ($("astFolder").value !== "__new__") return;
  const aid = $("astId").value;
  const cur = aid ? S.assistants.find(x => x.id === aid) : null;
  const prevVal = cur ? (cur.folderId || "") : "";
  createFolder((f) => populateFolderSelect(f.id), () => populateFolderSelect(prevVal));
};

function sanitizeFolderName(name) {
  let s = String(name || "").trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/^[\s.\-]+|[\s.\-]+$/g, "");
  if (!s) s = "assistant";
  if (s.length > 40) s = s.slice(0, 40).replace(/[\s.\-]+$/, "");
  return s;
}
function workspaceBase() {
  const custom = localStorage.getItem("oc_ws_base");
  if (custom) return String(custom).replace(/[\\/]+$/, "");
  if (homeDir) return String(homeDir).replace(/[\\/]+$/, "") + "\\opencode-workspaces";
  return "";
}
function uniqueWorkspace(name) {
  const base = workspaceBase();
  if (!base) return "";
  const folder = sanitizeFolderName(name);
  const used = new Set(S.assistants.map(a => normDir(a.directory)));
  let path = base + "\\" + folder;
  let i = 2;
  while (used.has(normDir(path))) { path = base + "\\" + folder + "-" + i; i++; }
  return path;
}
async function ensureWorkspaceDir(path) {
  await api("/_mkdir", {
    method: "POST", noDir: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

function renderToolChecks(disabled) {
  const box = $("astTools");
  box.innerHTML = "";
  const off = new Set(disabled || []);
  for (const id of allToolIds) {
    const label = el("label", "tool-check");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = id;
    cb.checked = !off.has(id);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(id));
    box.appendChild(label);
  }
}
function setAllToolChecks(on) {
  $("astTools").querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = on; });
}
$("astToolsAll").onclick = () => setAllToolChecks(true);
$("astToolsNone").onclick = () => setAllToolChecks(false);

function openAssistantModal(id, presetFolder) {
  const a = id ? S.assistants.find(x => x.id === id) : null;
  $("assistantTitle").textContent = a ? "编辑助手" : "新建助手";
  $("astId").value = a ? a.id : "";
  $("astName").value = a ? a.name : "";
  $("astIcon").value = a ? (a.icon || "") : "";
  astAvatarData = a ? (a.avatar || "") : "";
  renderAstAvatarPreview();
  $("astDir").value = a ? (a.directory || "") : "";
  $("astSystem").value = a ? (a.system || "") : "";
  $("astOverride").checked = !!(a && a.overrideBase);
  $("astPure").checked = !!(a && a.pureInput);
  $("astGitSafe").checked = !!(a && a.gitSafe);
  $("astTemp").value = (a && typeof a.temperature === "number") ? String(a.temperature) : "";
  $("astTopP").value = (a && typeof a.topP === "number") ? String(a.topP) : "";
  renderToolChecks(a ? a.disabledTools : []);
  astDirAuto = !a;
  if (!a) {
    const p = uniqueWorkspace("assistant");
    if (p) $("astDir").value = p;
  }
  populateFolderSelect(a ? (a.folderId || "") : (presetFolder || ""));
  populateAgentSelect(a ? (a.agent || "build") : "build");
  populateModelSelect(a ? a.model : (defaultModel || null));
  populateVariantSelect(a ? a.variant : null);
  $("astDelete").style.display = a ? "block" : "none";
  $("assistantMask").classList.add("show");
  setTimeout(() => $("astName").focus(), 30);
}
function renderAstAvatarPreview() {
  setAvatarContent($("astAvatarPreview"), astAvatarData, $("astIcon").value, $("astName").value);
}
$("astName").addEventListener("input", renderAstAvatarPreview);
$("astIcon").addEventListener("input", renderAstAvatarPreview);
$("astAvatarBtn").onclick = () => pickImageDataUrl((d) => { astAvatarData = d; renderAstAvatarPreview(); }, 160);
$("astAvatarClear").onclick = () => { astAvatarData = ""; renderAstAvatarPreview(); };
$("astName").addEventListener("input", () => {
  if (!astDirAuto) return;
  const p = uniqueWorkspace($("astName").value.trim() || "assistant");
  if (p) $("astDir").value = p;
});
$("astDir").addEventListener("input", () => { astDirAuto = false; });
$("astSave").onclick = async () => {
  const id = $("astId").value;
  const name = $("astName").value.trim();
  if (!name) { alert("请输入助手名称"); return; }
  let directory = $("astDir").value.trim();
  if (!directory) directory = uniqueWorkspace(name);
  if (!directory) { alert("请选择工作区目录"); return; }
  try {
    await ensureWorkspaceDir(directory);
  } catch (e) {
    alert("创建工作区失败：" + e.message);
    return;
  }
  let folderId = $("astFolder").value;
  if (folderId === "__new__") folderId = "";
  const agent = $("astAgent").value || "build";
  const modelVal = $("astModel").value;
  let model = null;
  if (modelVal) {
    model = parseModelKey(modelVal);
  }
  const variant = $("astVariant").value || null;
  const tempRaw = $("astTemp").value.trim();
  const topPRaw = $("astTopP").value.trim();
  let temperature = null;
  let topP = null;
  if (tempRaw !== "") {
    temperature = Number(tempRaw);
    if (!isFinite(temperature) || temperature < 0 || temperature > 2) { alert("温度需为 0 ~ 2 之间的数字（留空则使用默认）"); return; }
  }
  if (topPRaw !== "") {
    topP = Number(topPRaw);
    if (!isFinite(topP) || topP < 0 || topP > 1) { alert("topP 需为 0 ~ 1 之间的数字（留空则使用默认）"); return; }
  }
  const system = $("astSystem").value;
  const overrideBase = $("astOverride").checked;
  const pureInput = $("astPure").checked;
  const gitSafe = $("astGitSafe").checked;
  if (overrideBase && !system.trim()) { alert("启用「顶掉 opencode 基底提示词」时必须填写系统提示词"); return; }
  const disabledTools = Array.from($("astTools").querySelectorAll("input[type=checkbox]"))
    .filter(cb => !cb.checked).map(cb => cb.value);
  const icon = $("astIcon").value.trim();
  const avatar = astAvatarData || "";
  const assistant = { id, name, icon, avatar, folderId: folderId || null, directory, agent, model, variant, temperature, topP, system, overrideBase, pureInput, gitSafe, disabledTools };
  const old = id ? S.assistants.find(x => x.id === id) : null;

  if (id) {
    const idx = S.assistants.findIndex(x => x.id === id);
    S.assistants[idx] = assistant;
  } else {
    assistant.id = uid("ast");
    S.assistants.push(assistant);
  }
  saveStore();
  $("assistantMask").classList.remove("show");
  renderTree();
  if (assistant.id === S.activeId) {
    if (old && normDir(old.directory) !== normDir(directory)) {
      activateAssistant(assistant.id, { restore: true });
    } else {
      refreshAssistantChrome();
    }
  } else if (!id) {
    activateAssistant(assistant.id, { restore: false });
  }
  refreshMessageRoles();
};
$("astDelete").onclick = () => {
  const id = $("astId").value;
  if (id) { $("assistantMask").classList.remove("show"); deleteAssistant(id); }
};
$("astCancel").onclick = () => $("assistantMask").classList.remove("show");
$("newAssistant").onclick = () => openAssistantModal(null, null);

function deleteAssistant(id) {
  const a = S.assistants.find(x => x.id === id);
  if (!a) return;
  if (!confirm('删除助手「' + a.name + '」？其会话记录仍保留在 opencode 工作区中。')) return;
  if (a.favorite && !confirm('「' + a.name + '」已收藏。仍要删除吗？')) return;
  S.assistants = S.assistants.filter(x => x.id !== id);
  delete S.last[id];
  if (S.activeId === id) S.activeId = S.assistants[0] ? S.assistants[0].id : null;
  saveStore();
  renderTree();
  if (S.activeId) activateAssistant(S.activeId, { restore: true });
  else resetMain();
}

function uniqueAssistantName(base) {
  const root = String(base || "助手").replace(/[（(]\d+[）)]$/, "").trim() || "助手";
  const used = new Set(S.assistants.map(a => a.name));
  let i = 1;
  while (used.has(root + "（" + i + "）")) i++;
  return root + "（" + i + "）";
}

async function duplicateAssistant(id) {
  const src = S.assistants.find(x => x.id === id);
  if (!src) return;
  const name = uniqueAssistantName(src.name);
  const directory = uniqueWorkspace(name);
  if (!directory) { alert("无法生成新的工作区目录"); return; }
  try {
    await ensureWorkspaceDir(directory);
  } catch (e) {
    alert("创建工作区失败：" + e.message);
    return;
  }
  const copy = {
    id: uid("ast"),
    name,
    icon: src.icon || "",
    avatar: src.avatar || "",
    folderId: src.folderId || null,
    directory,
    agent: src.agent || "build",
    model: src.model ? { providerID: src.model.providerID, id: src.model.id } : null,
    variant: src.variant || null,
    temperature: typeof src.temperature === "number" ? src.temperature : null,
    topP: typeof src.topP === "number" ? src.topP : null,
    system: src.system || "",
    overrideBase: !!src.overrideBase,
    pureInput: !!src.pureInput,
    gitSafe: !!src.gitSafe,
    disabledTools: Array.isArray(src.disabledTools) ? src.disabledTools.slice() : [],
    favorite: false,
  };
  S.assistants.push(copy);
  saveStore();
  renderTree();
  showToast("已复制为「" + name + "」");
}

