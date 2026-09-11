/* ============ 启动 ============ */
async function boot() {
  loadStore();
  await Promise.all([loadModels(), loadAgents(), loadTools(), loadLocalSecrets()]);

  let pathInfo = null;
  try { pathInfo = await api("/path", { noDir: true }); } catch (e) {}
  if (pathInfo) homeDir = pathInfo.home || pathInfo.directory || "";

  try { if (typeof sweepHostingScratch === "function") await sweepHostingScratch(); } catch (e) {}

  if (!S.assistants.length) {
    const dir = pathInfo ? (pathInfo.directory || pathInfo.home || "") : "";
    S.assistants.push({
      id: uid("ast"), name: "默认助手", icon: "", folderId: null,
      directory: dir, agent: "build", model: defaultModel || null, system: "",
    });
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
}
boot().catch((e) => {
  console.error(e);
  showPlaceholder("初始化失败：" + e.message);
});
