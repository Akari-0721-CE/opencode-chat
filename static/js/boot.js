/* ============ 启动 ============ */
async function boot() {
  if (typeof startBootWatch === "function") startBootWatch();
  if (typeof applyI18n === "function") applyI18n();
  if (typeof initLangSeg === "function") initLangSeg();
  if (typeof restoreProfile === "function") { try { await restoreProfile(); } catch (e) {} }
  loadStore();
  await Promise.all([loadModels(), loadAgents(), loadTools(), loadLocalSecrets()]);

  let pathInfo = null;
  try { pathInfo = await api("/path", { noDir: true }); } catch (e) {}
  if (pathInfo) homeDir = pathInfo.home || pathInfo.directory || "";

  try { if (typeof sweepHostingScratch === "function") await sweepHostingScratch(); } catch (e) {}

  if (!S.assistants.length && typeof seedDefaultAssistant === "function") seedDefaultAssistant();
  if (!S.activeId || !S.assistants.some(a => a.id === S.activeId)) {
    S.activeId = S.assistants[0].id;
  }
  saveStore();
  renderTree();
  refreshAssistantChrome();
  await activateAssistant(S.activeId, { restore: true });
  connectEvents();
  loadBg();
  if (typeof initProfileAutosave === "function") initProfileAutosave();
  if (typeof initRangeFills === "function") initRangeFills();
  if (typeof maybeShowOnboarding === "function") maybeShowOnboarding();
}
boot().catch((e) => {
  console.error(e);
  showPlaceholder("初始化失败：" + e.message);
});
