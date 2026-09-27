/* ============ 一键重启（opencode + 中间层） ============ */
/* 不是浏览器刷新（F5）：先让中间层重启 opencode，再由独立助手进程重启
   中间层本身（服务内不自重启，避免没人接管端口）。
   重启期间本页会短暂失联，故轮询 /api/_version，检测到新进程后自动刷新。 */
(function () {
  const btn = $("restartAppBtn");
  if (!btn) return;
  let busy = false;

  function rt(s, ...a) {
    if (typeof tf === "function" && a.length) return tf(s, ...a);
    if (typeof t === "function") return t(s);
    return s;
  }

  async function versionInfo() {
    try {
      const res = await fetch("/api/_version", { cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      return (j && j.ok) ? j : null;
    } catch (e) { return null; }
  }

  async function waitNewServer(deadline, prevPid) {
    while (Date.now() < deadline) {
      const j = await versionInfo();
      if (j && (!prevPid || j.pid !== prevPid)) return true;
      await new Promise((r) => setTimeout(r, 800));
    }
    return false;
  }

  btn.onclick = async () => {
    if (busy) return;
    if (typeof isRemote === "function" && isRemote()) return;
    const go = await confirmDialog({
      title: rt("重启服务"),
      text: rt("将重启 opencode 与中间层，期间页面会短暂断开，完成后自动刷新。确定继续？"),
      okText: rt("重启"),
    });
    if (!go) return;
    busy = true;
    btn.disabled = true;
    btn.classList.add("restarting");
    showToast(rt("正在重启 opencode 与中间层…"));
    const before = await versionInfo();
    const prevPid = before && before.pid;
    const deadline = Date.now() + 120000;
    try {
      await api("/_app/restart", { method: "POST", noDir: true });
    } catch (e) { /* 中间层可能已退出，继续等待新进程 */ }
    if (await waitNewServer(deadline, prevPid)) {
      showToast(rt("重启完成，正在刷新…"));
      setTimeout(() => location.reload(), 400);
      return;
    }
    busy = false;
    btn.disabled = false;
    btn.classList.remove("restarting");
    showToast(rt("重启超时，请重新打开本程序"), true);
  };
})();
