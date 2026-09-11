/* ============ 昵称 / 头像（纯前端展示，不发给模型） ============ */
function userProfile() {
  return {
    name: localStorage.getItem("oc_user_name") || "你",
    avatar: localStorage.getItem("oc_user_avatar") || "",
  };
}
function setAvatarContent(box, avatar, iconChar, name) {
  box.innerHTML = "";
  if (avatar) {
    const img = document.createElement("img");
    img.src = avatar;
    img.alt = "";
    box.appendChild(img);
    box.style.background = "";
  } else {
    box.textContent = (iconChar && iconChar.trim()) || (name || "?").trim().charAt(0) || "?";
    box.style.background = avatarColor(name || iconChar || "?");
  }
}
function fillRole(roleEl, role) {
  roleEl.innerHTML = "";
  const av = el("span", "msg-avatar");
  if (role === "user") {
    const p = userProfile();
    setAvatarContent(av, p.avatar, "", p.name);
    roleEl.append(av, document.createTextNode(p.name || "你"));
  } else {
    const a = activeAssistant();
    setAvatarContent(av, a && a.avatar, a && a.icon, a && a.name);
    roleEl.append(av, document.createTextNode((a && a.name) || "assistant"));
  }
}
function refreshMessageRoles() {
  for (const id in msgEls) {
    const entry = msgEls[id];
    if (!entry || !entry.el) continue;
    const roleEl = entry.el.querySelector(".role");
    if (roleEl) fillRole(roleEl, entry.role);
  }
}
function pickImageDataUrl(cb, size) {
  const S = size || 128;
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*";
  inp.onchange = async () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    const r = await cropImageFile(file, {
      aspect: 1,
      outSize: Math.max(S, 256),
      mime: "image/webp",
      title: "裁剪头像",
      ratios: [{ label: "1:1", value: 1 }],
    });
    if (r) cb(r.dataUrl);
  };
  inp.click();
}

function loadScript(src) {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}
function loadCss(src) {
  return new Promise((resolve) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = src;
    l.onload = () => resolve(true);
    l.onerror = () => resolve(false);
    document.head.appendChild(l);
  });
}
Promise.all([loadScript(MARKED_URL), loadScript(HLJS_URL), loadCss(HLJS_CSS), loadScript(KATEX_URL), loadCss(KATEX_CSS)]);

