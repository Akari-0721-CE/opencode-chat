/* ============ 启动 ============ */
async function boot() {
  if (typeof applyI18n === "function") applyI18n();
  if (typeof initLangSeg === "function") initLangSeg();
  if (typeof initRemote === "function") {
    const ready = await initRemote();
    if (!ready) return;
  }
  if (typeof startBootWatch === "function") startBootWatch();
  const remote = typeof isRemote === "function" && isRemote();
  if (typeof restoreProfile === "function") { try { await restoreProfile(remote); } catch (e) {} }
  loadStore();
  await Promise.all([
    loadModels(), loadAgents(), loadTools(),
    remote ? Promise.resolve() : loadLocalSecrets(),
  ]);

  let pathInfo = null;
  try { pathInfo = await api("/path", { noDir: true }); } catch (e) {}
  if (pathInfo) homeDir = pathInfo.home || pathInfo.directory || "";

  try { if (typeof sweepHostingScratch === "function") await sweepHostingScratch(); } catch (e) {}

  if (!S.assistants.length && !remote && typeof seedDefaultAssistant === "function") seedDefaultAssistant();
  if (!S.assistants.length) {
    renderTree();
    showPlaceholder(remote
      ? "未能从主机同步到助手，请确认主机端已创建助手并已开启远程访问。"
      : "还没有助手，先新建一个吧");
    return;
  }
  if (!S.activeId || !S.assistants.some(a => a.id === S.activeId)) {
    S.activeId = S.assistants[0].id;
  }
  saveStore();
  renderTree();
  refreshAssistantChrome();
  await activateAssistant(S.activeId, { restore: true });
  connectEvents();
  loadBg();
  if (!remote && typeof initProfileAutosave === "function") initProfileAutosave();
  if (typeof initRangeFills === "function") initRangeFills();
  if (!remote && typeof maybeShowOnboarding === "function") maybeShowOnboarding();
}
boot().catch((e) => {
  console.error(e);
  showPlaceholder("初始化失败：" + e.message);
});
