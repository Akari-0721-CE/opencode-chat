# opencode 自建前端 · 版本说明

- 版本：v0.2.0
- 日期：2026-09-12
- 组成：Python 代理 + 多文件前端 + opencode 插件 + 发布工程

## 未发布（修复：杀软 HTTPS 扫描导致模型调用证书错误）

- **问题**：Kaspersky 等杀毒软件的「HTTPS 扫描」会用其根证书做中间人重签。Windows 信任该根证书，但 opencode 使用的 Node/Bun 运行时只信任自带 CA 库，导致模型调用报 `unknown certificate verification error`（个别请求表现为 `fetch failed`）。
- **修复**：`release/launcher.py` 新增 `ensure_extra_ca_certs()`，启动时把 Windows 受信任根证书（ROOT/CA）导出为 `~/.config/opencode-chat/node-extra-ca.pem` 并设置 `NODE_EXTRA_CA_CERTS`；`server.py` 的「重启 opencode」也通过 `node_tls_env()` 注入同一变量，覆盖自动重启路径。
- **验证**：导出后 Node `fetch('https://api.deepseek.com')` 由证书错误变为成功（返回 401）；opencode 二进制内含 `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE` 处理，证实其 Bun 运行时支持。
- 生效方式：需重启本程序（确保旧 `opencode.exe` 已结束）；发布工程改动需重新打包。

## 未发布（开源与发布准备）

- **开源许可**：新增根目录 `LICENSE`（MIT）；`README` 增加「声明」（个人自用练习项目、非官方、与上游无关联）与「开源许可与第三方声明」章节。
- **第三方声明**：新增 `THIRD-PARTY-NOTICES.md`，列明分发的第三方组件（marked / DOMPurify / KaTeX / highlight.js）及运行时获取的组件（opencode / 便携 Python）与构建期工具（rcedit）的许可。
- **安全约定**：新增 `SECURITY.md`；新增 `.gitattributes` 统一换行；`.gitignore` 补全密钥 / 临时 / 编辑器忽略项。
- **发布打包**：`release/build.ps1` 将 `LICENSE` 与 `THIRD-PARTY-NOTICES.md` 一并复制进发布包，确保分发合规。
- **敏感数据核查**：确认 git 历史与跟踪文件不含密钥、令牌或本机敏感路径；`app-profile/` 等本机数据均在忽略之列。

## v0.2.0 变更（首个对外候选版本）

- **里程碑**：将验收通过的 `v0.1.79` 定为 **`v0.2.0` 发布候选（对外便携版）**；功能代码与 0.1.79 相同（仅新增下方版本管理改进）。
- **汇总 0.1.75–0.1.79 发布工程与关键修复**：
  - 独立卸载脚本（不卸载系统 opencode/Node）；启动器安全升级与组件复用。
  - 无 Node 自动获取 opencode：从 npm 源下载平台二进制（官方优先→npmmirror 回退，`shasum` 校验），解压到 `runtime\opencode\`。
  - 端口占用自动回退：非本程序占用则换端口，本程序旧进程则结束升级，避免打开后 404。
  - 连接服务商后自动重启 opencode 使加密密钥生效，修复「模型不显示」；服务商弹窗加手动重启按钮。
  - 首次下载 opencode 的顶部可见进度条（准备/下载/校验/解压/启动/失败）。
- **版本管理**：`rollback.bat` 快照范围扩展至 `release\`（`launcher.cs`/`launcher.py`/`build.ps1`/`uninstall.bat`/`uninstall.ps1`）与根 `README.md`，回滚更完整。
- 生效方式：发布工程改动，需重新打包；源码运行不受影响。

## v0.1.79 变更（首次下载 opencode 的可见进度）

- **问题**：首次运行下载 opencode 组件（约 60–100MB）时，除开始时一次弹窗外界面无任何提示，用户会误以为「不能用」。
- **进度提示**：启动器把下载/校验/解压状态写入 `%USERPROFILE%\.config\opencode-chat\opencode-install.json`（每 512KB 更新，含已下载/总大小）。`server.py` 新增 `GET /api/_opencode/status`（令牌保护）供前端轮询。
- **界面顶部常驻提示条**：`#ocBootHint` 实时显示「正在准备 / 正在下载 opencode：x / y MB（进度条）/ 校验中 / 解压中 / npm 安装中 / 正在启动本地服务 / 准备失败」，就绪后自动隐藏并重新加载模型。
- 覆盖状态：`preparing` / `downloading` / `verifying` / `extracting` / `installing-npm` / `ready` / `error`。
- 文案已补中英对照；`node --check`、server 冒烟 8 项、前端 45 项全绿。
- 生效方式：`server.py` 改动**需重启前端**；纯前端 Ctrl+F5。发布工程改动需重新打包。

## v0.1.78 变更（修复：连接服务商后模型不显示）

- **问题**：API Key 走「DPAPI 加密存 `~/.config/opencode-chat/secrets.json` + 插件在 opencode **启动时**注入 provider」的架构。保存 Key 后 opencode 仍用旧配置，因此模型列表看不到新 provider 的模型，**刷新也无效**；而启动器又会复用已运行的 opencode，重开程序依然不生效。
- **修复**：`server.py` 新增 `POST /api/_opencode/restart`——结束 4096 上确认为 `opencode` 的进程（按进程名判定）并重新 `opencode serve`，使插件重新读取 `secrets.json`。前端保存服务商 Key 后**自动调用重启**，随后重新加载模型/服务商；事件流（SSE）由浏览器自动重连。
- **手动入口**：服务商与模型弹窗右上角新增「重启 opencode」按钮（↻ 图标旁），用于 OAuth 或异常后手动重载。
- 说明：重启会使正在进行的生成中断，属预期（换 Key 时）。OAuth 连接一般无需重启，但该入口同样可用于排障。
- 测试：前端 `node --check` 全过；server 冒烟 8 项全绿。
- 生效方式：`server.py` 改动**需重启本程序前端**（重开即可），前端 Ctrl+F5。

## v0.1.77 变更（端口占用更稳健，修复打开后 404）

- **端口占用自动回退**：前端端口（默认 8000）被**非本程序**占用时，启动器不再强行打开该端口（对方可能返回 404），而是**自动改用下一个空闲端口**（8000→8001…最多 20 个）并打开新界面。
- **旧版本识别增强**：当 `/_version` 不可用（旧版服务无该接口）时，改用 `netstat -ano` 定位占用端口的 PID，再按进程映像路径判断是否为本程序；是本程序则结束并升级，否则回退端口。
- **前端未就绪不再打开空白页**：仅当端口确实可访问时才打开窗口；否则弹窗提示并写日志，避免用户看到 404 / 连接失败。
- 说明：本机 8000 上曾长期运行旧 `server.py`（无 `/_version`，请求返回 403），旧逻辑会误判并直接打开；新逻辑已覆盖此场景。
- 生效方式：发布工程改动，需重新打包；源码运行不受影响。

## v0.1.76 变更（无 Node 自动获取 opencode）

- **取消 Node.js 依赖**：首次运行若本机没有 opencode，启动器改为**直接从 npm 源下载 opencode 的 Windows 运行组件**（`opencode-windows-x64` / `opencode-windows-arm64`，约 60–100MB），解压出 `opencode.exe` 到 `runtime\opencode\`。用户**无需安装 Node.js**。
  - 下载源**官方优先、失败自动回退 npmmirror**；校验包 `shasum`（SHA-1）后再解压。
  - 解压仅取其中的 `opencode.exe`，并写入版本标记 `runtime\opencode\VERSION`。
  - 检测顺序：`runtime\opencode\` → 已安装的全局 opencode → `PATH`；已存在则复用、不重复下载。
  - 失败时回退到 npm 安装（若本机有 Node.js），仍失败则提示检查网络。
- **首次下载体验**：下载前弹窗提示体积与「请勿关闭」，日志记录进度（每 20MB）。
- 卸载说明同步：随程序目录的 `runtime\opencode\` 随程序删除；不影响系统全局 opencode / Node.js。
- 生效方式：发布工程改动，需重新打包；已装组件复用的逻辑不变。
- 备注：本机网络 `github.com` 不可达而 npm 源可达，故采用 npm 源二进制而非 GitHub Release。

## v0.1.75 变更（卸载功能 + 安全升级）

- **独立卸载脚本**：新增 `release/uninstall.bat` + `release/uninstall.ps1`，随包打到产物根目录。双击后交互确认，可删除**程序目录**，并按选择删除**本软件用户数据**（`%USERPROFILE%\.config\opencode-chat\`）。
  - 仅结束本安装目录内的进程（server.py 等）与本程序打开的 Edge 窗口，**不触碰 opencode 本体、Node.js 或全局组件**。
  - 因脚本自拷贝到 `%TEMP%` 后再执行，安装目录无文件占用，可整目录删除。
  - 本软件安装到 opencode 的插件**不随卸载删除**，脚本会给出提示路径。
- **安全升级能力**（`release/launcher.py`）：启动时若 8000 端口上的服务版本与当前不一致，且确认是**本程序旧版本**（进程映像位于安装目录内），则自动结束旧进程并启动新版本，避免升级后仍连旧服务。
- **组件复用**：opencode / Node 已存在则不重复安装；插件内容一致时不重复写入（`_copy_if_changed`）。
- 打包：`release/build.ps1` 将卸载脚本复制到产物根目录；`README.md` 补充「卸载」「升级 / 更新」说明。
- 生效方式：发布工程改动，需重新打包；源码运行不受影响。

## v0.1.74 变更（补齐英文词条 + 动态自动翻译）

- **新增 `tf()`**：支持带参数整句（`{0}` 占位），用于拼接串（如「加载更早消息（还有 N 条）」）。
- **MutationObserver 自动翻译**：动态插入的界面文本 / `placeholder` / `title` / `aria-label` 自动按词表翻译；监听时**跳过**消息内容、代码块、会话标题、助手名等用户内容（并以 `_i18nApplying` 防止自触发循环）。
- **词表补齐**：一次性补齐各模块动态文案（会话/回收站、消息操作、用量/上下文、服务商/OAuth、助手编辑、OCR、翻译、托管、附件裁剪、数据备份、权限/提问、搜索/收藏等）共新增约 200 条。
- **关键拼接串**接入 `tf`：加载更早、清理记录、导入备份、附件超限、OCR 进度、模型选择、服务商连接等。
- **会话时间/分组**（今天/昨天/日期、未命名/未归属）改为在渲染层经 `t()`（不改动受测纯函数）。
- 测试：前端纯函数单测 **45** 项、server 冒烟 **8** 项全绿；`node --check` 全过；打包安全审计 99 项通过。
- 生效方式：纯前端，**Ctrl+F5**。

## v0.1.73 变更（多语言：中文 / English）

- **i18n 框架**：新增 `js/i18n.js`。以中文原文为 key，`t()` 查英文表并回退中文；`translateDom()` 对静态界面做「文本 / 属性（placeholder / title / aria-label）」精确匹配翻译（自动跳过消息内容、代码块、会话标题、助手名等用户内容）；`setLang()` 持久化 `oc_lang`、切换 `<html lang>`、广播 `onLangChange`。
- **语言选择**：设置新增「语言」分段控件（中文 / English）；首启向导第 1 步也提供语言切换；首次运行按系统语言（`navigator.language`）自动判定。
- **翻译范围**：静态界面（侧栏 / 顶栏 / 设置全部标签与说明 / 各弹窗 / 助手编辑 / 裁剪 / 服务商 / OCR / 收藏 / 回收站 / 权限等）、渲染质量三档说明、`TOOL_INFO` 全部工具名与说明、首启向导全流程、服务商连接状态等。
- **动态刷新**：切换语言后重渲染渲染质量说明、工具勾选、会话列表、助手栏等（`refreshI18nDynamic`）。
- 测试：前端纯函数单测 **45** 项（新增 i18n `t()` 翻译/回退）、server 冒烟 **8** 项，全绿。
- 生效方式：纯前端（新增 `js/i18n.js`，改 `index.html`/`boot.js`/`core.js`/`settings.js`/`onboarding.js`/`providers.js`/`app.css`），**Ctrl+F5**；重新打包见 `release/build.ps1`。

## v0.1.72 变更（首启向导 + 内置默认助手 + 打包安全审计）

- **首启向导（R5）**：新增 `js/onboarding.js`。新装首次进入时弹出三步向导：
  1. 欢迎说明（本地运行、数据不出本机）；
  2. 连接服务商：一键「连接 opencode Zen」（含免费模型）或打开服务商管理填自己的 Key，并实时显示已连接列表；
  3. 就绪：展示默认助手/工作区/模型，提供「测试连接」（经临时会话发一条最小消息验证 Key 与连通性）与「完成」。
  - 老用户（已有本地密钥 + 助手）自动跳过；设置 → 「新手向导 → 重新运行」可随时重开。
- **内置默认助手（新装）**：`seedDefaultAssistant()` 首次创建「使用答疑助手」：专属工作区、`favorite`、`gitSafe`，默认用 opencode Zen 免费模型（Big Pickle / MiMo Free 等，自动择一），系统提示词为使用指南（连接模型 / 新建助手 / OCR / 翻译 / 渲染质量 / 快捷键），并**默认禁用破坏性工具**（bash/write/edit/apply_patch）。
- **打包安全审计**：`release/build.ps1` 新增审计步骤——产物不得含 `secrets.json`/`profile.json`/`auth.json`/`.env`、`app-profile`/`node_modules`/`.git`/`backups`，文本文件不得含本机用户名或 `C:\Users\` 绝对路径；不通过即中止打包。实测 98 项全通过。
- 测试：前端纯函数单测 **44** 项、server 冒烟 **8** 项全绿；`node --check` 全过。
- 生效方式：纯前端改动（新增 `js/onboarding.js`、`boot.js`、`index.html`、`app.css`）+ `release/build.ps1`；**Ctrl+F5** 即可（打包脚本改动不影响运行态）。

## v0.1.71 变更（发布工程：便携打包骨架）

- **首个对外发布版准备**（便携 ZIP + 内置便携 Python）。详见 `TODO-RELEASE.md`。
- **`server.py` 新增公开 `GET /api/_version`**：返回 `{ok, version, pid}`，供启动器判断「已在运行 / 旧进程 / 版本不符」。（需重启 server.py 生效。）
- **新启动器**：`release/launcher.cs`（C#，无控制台，系统 `csc.exe` 编译）+ `release/launcher.py`（编排）：
  - 安装/更新 opencode 插件到 `~/.config/opencode/plugins/`（官方自动加载目录，**免改 `opencode.jsonc`**；旧配置已注册 `base-override` 时更新旧 `plugin/` 以避免重复加载）。
  - 启动/复用本地代理 `server.py`（用随包便携 Python，按 `/_version` 判定）。
  - 检测 `opencode serve --port 4096`，缺失时自动 `npm install -g opencode-ai` 再启动；失败弹窗引导安装 Node.js。
  - 用 Edge `--app` + 独立 `--user-data-dir` 打开应用；日志写 `~/.config/opencode-chat/logs/launcher.log`。
- **打包脚本** `release/build.ps1`：组装 `dist/opencode-chat/`（app + 便携 Python + 启动器 + README）→ 下载 `python-3.13.7-embed-amd64` → `csc` 编译 → rcedit 盖 exe 版本 → 生成 `dist/opencode-chat-<版本>.zip`。
- **文档**：新增根 `README.md`（安装 / 使用 / 常见问题 / 卸载 / 重新打包）。
- **`.gitignore`**：忽略 `dist/` 与 `release/.cache/`。
- 验证：便携 Python 运行 `server.py`，`GET /api/_version` 冒烟 OK；`csc` 编译与 rcedit 盖章 OK；`node --check`/`py_compile` OK；`tools\test.bat` 全绿。
- 生效方式：`server.py` 改动**需重启**；其余为新增发布工程文件，不影响现有 dev 运行。

## v0.1.70 变更（渲染质量滑块 + 背景升级 + 高质量动效）

- **渲染质量三档**：设置新增「渲染质量」分段控件 `性能优先 / 标准 / 高质量`（`oc_render_quality`）。原「低性能模式」并入本档，旧 `oc_low_perf=1` 自动迁移为「性能优先」；`renderQuality()` / `setRenderQuality()` / `applyRenderQuality()` 取代旧开关。
  - **性能优先**：关闭毛玻璃/界面动画/动态背景动画；长会话分批渲染、流式刷新合并（同原低性能模式）。
  - **标准**：默认观感，动态背景正常播放。
  - **高质量**：立体毛玻璃（多层内高光 + 深阴影 + 半透明描边）、悬停/入场动画、顶栏/侧栏流光、消息收发动效（批量渲染历史时不播放）。
- **背景来源升级**：`背景` 设置改为下拉选择 `无 / 本地图片 / 本地视频 / 动态·极光 / 动态·星野 / 动态·粒子连线 / 动态·流光网格`。
  - 动态预设由本机 `canvas` 绘制（`media.js`），不加载外部资源；「性能优先」档只画静态一帧。
  - 本地视频存入 **IndexedDB**（`oc_bg_store/media`）持久化，刷新仍在；新增 `#bgVideo`/`#bgCanvas` 图层。
  - 本地图片继续压到最大 1920×1080 JPEG 存 `localStorage`。
- **CSP**：`server.py` 增加 `media-src 'self' blob:` 以允许本地视频背景（**需重启 server.py**；图片/动态预设仅 Ctrl+F5）。
- 测试：前端纯函数单测 **44** 项（新增 `renderQuality` 迁移/优先级）、server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端（`index.html`/`app.css`/`js/core.js`/`js/settings.js`/`js/media.js`/`js/sessions.js`）+ `server.py` CSP（重启）。**Ctrl+F5**。

## v0.1.69 变更（助手弹窗排版整齐化）

- **工具列表改网格**：助手 → 「工具」由 `flex-wrap` 改为两列 CSS Grid（`repeat(2, minmax(0,1fr))`，窄屏 ≤560px 退为单列），勾选、名称、说明按列对齐，不再因说明换行而错位。
- **成对字段对齐**：`.field-row > .field` 改为列向 flex、其 `label` 撑满，使「默认 Agent / 默认模型」这类左标签行数不同的字段，下拉框底部对齐；字段内 `.hint-inline` 改为独立一行（11px 灰字），标签更清爽。
- 生效方式：纯样式改动（`app.css`，未改 JS/HTML 结构），**Ctrl+F5** 即可。

## v0.1.68 变更（工具说明 / 新手易用性）

- **工具说明映射**：`core.js` 新增 `TOOL_INFO` 与 `toolInfo(id)`，为每个 opencode 工具提供中文名与一句话说明（bash 运行命令、read 读取文件、grep 搜索内容、question 向你提问等）。
- **助手 → 工具列表**：工具栏勾选项由「裸 id」改为「中文名 + 灰色说明」，鼠标悬停显示 `id：说明`；未知名工具回退显示原名。
- **对话内工具卡片**：工具块标题显示中文名，悬停显示 `原始 id：说明`，方便小白理解 agent 在做什么。
- **助手表单补充说明**：所属文件夹、工作区目录、默认 Agent、默认模型均补了新手提示。
- **兜底工具列表**：`providers.js` 拉取失败时的回退列表补上 `question`。
- **顺带修复运行态问题**：`/_profile` 每 4s 报 404 经排查为 **8000 端口仍在跑 03:57 启动的旧 `server.py` 进程**（早于 13:20 的改动，缺 `/_profile` 路由），重启后 `POST /api/_profile` 返回 200、自动落盘恢复。（`server.py` 代码本身未改。）
- 测试：前端纯函数单测 **43** 项（新增 `toolInfo`）、server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`js/core.js`/`js/assistants.js`/`js/render.js`/`js/providers.js`/`index.html`/`app.css`），**Ctrl+F5** 即可。

## v0.1.67 变更（低性能模式）

- **新增设置项**：设置 → 「低性能模式」开关（`oc_low_perf`，随 `/_profile` 落盘）。为低配机 / 超长会话准备，兼顾核心功能不受影响，仅牺牲部分视觉效果。
- **长会话按需渲染**：开启后单个会话**只先渲染最近 40 条**，顶部出现「加载更早消息（还有 N 条）」按钮，分批向上加载（每批 40 条，直接插入，不重排已有节点）；收藏跳转若目标在未渲染区会自动向上加载定位。
- **关闭毛玻璃**：`body.low-perf` 下所有 `backdrop-filter` 置为 `none`（`--glass-blur` 不再生效）。
- **关闭动画 / 过渡**：`body.low-perf` 下动画与过渡时长压到亚毫秒、只播放一次；侧栏、弹窗、开关、呼吸点等动效停用。
- **合并流式刷新**：`events.js` 在低性能模式下把每个事件末尾的 `markLastAssistant` / `updateScrollBottom` 用 `requestAnimationFrame` 合并，降低流式输出时的主线程开销。
- **设置提醒**：设置项内联说明「会影响什么 / 不影响什么」；标题右侧显示「已开启」状态；切换时弹 Toast 提示；切换后立即重渲染当前会话（生成进行中则延后到下次进入会话）。
- **实现要点**：`core.js` 提供 `lowPerfEnabled` / `applyLowPerf` 并启动时应用；`render.js` 新增 `renderMount`（分段渲染到 `DocumentFragment` 再整体插入）；`sessions.js` 管理 `sessionMessages` / `sessionRenderStart`。
- 测试：前端纯函数单测 **42** 项（新增 `lowPerfEnabled`）、server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`js/core.js`/`js/render.js`/`js/state.js`/`js/sessions.js`/`js/events.js`/`js/settings.js`），**Ctrl+F5** 即可。

## v0.1.66 变更（设置内搜索）

- **搜索框**：设置弹窗标题下新增 `#settingsSearch`，按关键词过滤设置项（不区分大小写，空格分隔多词为「与」匹配）。
- **覆盖高级设置**：搜索时自动展开「高级设置」并隐藏折叠按钮，清除后恢复原折叠状态（沿用 `oc_settings_more`）。
- **匹配范围**：设置项自身文本 + 内部输入框的 placeholder / title / aria-label（如「翻译模型」「OCR 提示词」均可搜到）。
- **空结果**：显示「没有匹配的设置项」提示。
- 测试：前端纯函数单测 **41** 项（新增 `settingsQueryMatches`）、server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`js/settings.js`），**Ctrl+F5** 即可。

## v0.1.65 变更（自动 OCR 进度提示与动效）

- **问题**：自动 OCR 期间发送按钮被禁用且无任何反馈，看上去像「卡死 / 无法发送」。
- **进度提示**：输入框上方新增 `#ocrProgress`，OCR 时显示「正在 OCR 识图（n/总数）：文件名」，带旋转 spinner 与不确定进度条；`buildOcrSendParts` 增加逐张进度回调。
- **发送按钮动效**：OCR 期间给发送按钮加 `ocr-working`（图标旋转 + 主题色 + `cursor: wait`），标题改为「正在 OCR 识图，请稍候…」，结束后恢复。
- **状态一致性**：`updateSendState()` 纳入 `ocrSending`，OCR 期间即使用户改输入也不会误恢复发送按钮；发送逻辑完成/失败均走 `finally` 收尾提示与状态。
- **无障碍**：`prefers-reduced-motion` 下降低动效速度。
- 测试：前端纯函数单测 **40** 项、server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`js/ocr.js`/`js/send.js`/`js/attachments.js`），**Ctrl+F5** 即可。

## v0.1.64 变更（修复：开启自动 OCR 时图片被能力校验拒收）

- **问题**：`addFiles` 会在添加附件时按 `modelSupports` 拦截图片；纯文本模型下开启「自动 OCR」后，图片在走到 OCR 之前就被拒收（提示「模型不支持图片输入」）。
- **修复**：新增 `autoOcrEnabled()`；当前助手开启自动 OCR 时，`addFiles` 对**图片**跳过能力校验（图片会被 OCR 转成文字发送，不需要模型支持图片）。`send()` 的常规能力校验仍在自动 OCR 分支之后，PDF / 音频 / 视频等非图片仍按原逻辑校验。
- 测试：前端纯函数单测 **40** 项、server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`js/attachments.js`），**Ctrl+F5** 即可。

## v0.1.63 变更（OCR：模型识图 + 批量识别 + 非视觉模型自动 OCR）

- **新增 `static/js/ocr.js`**：用「临时会话」调用模型识别图片文字（复用翻译的 scratch 模式，用完即删，不写入当前对话）。
- **设置（设置 → 高级）**：
  - **OCR 模型**：可搜索 / 折叠提供商的模型选择器（复用 v0.1.58 浮层），**仅手动指定**。
  - **优先专用模型**：自动检测名称 / id 含「OCR」的模型（如 `deepseek-ai/DeepSeek-OCR`、`PaddlePaddle/PaddleOCR-VL-1.5`）排在最前，一键选用；没有专用模型时推荐视觉模型（`capabilities.input.image` / `attachment`）。
  - **OCR 提示词 / 思考强度**：可编辑、可重置（存 `oc_ocr_prompt` / `oc_ocr_variant`）。
- **手动 + 批量 OCR 面板**（工具栏「OCR」按钮 / 附件图片上的「OCR」按钮）：收集**当前附件与当前会话中的图片**，逐张识别、显示进度，结果可编辑 / 单张复制 / 复制全部 / 插入输入框。
- **自动 OCR（按助手开关，用户决定，不看能力标注）**：助手编辑里新增「自动 OCR 图片」。开启后发送带图片的消息时，先 OCR，把**文字**作为消息内容发给模型（图片不再作为图片发送），从而让纯文本模型也能「看图」；图片仍在本机聊天记录中保留显示。
- **本地图片保留**：未发送的图片以对话文本为键存入**浏览器 IndexedDB**（不写入 localStorage / 备份，避免爆仓），用户消息渲染时自动把图片注入气泡（点击可放大），刷新 / 重开后仍在。
- **接口**：发送走 `/session/{id}/prompt_async`，`parts` 为 `file`（data URL）+ 系统提示词，并禁用全部工具（避免函数调用报错）。
- 已知：个别专用 OCR 模型在 opencode 下会因 `max_tokens (8192) > max_seq_len` 或上下文限制报错，改用视觉模型即可；已在设置提示中说明。
- 测试：前端纯函数单测增至 **40** 项（新增 `isOcrModelName` / `isVisionModel` / `ocrDisplayKeyFromParts` 3 项）；server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`js/*`/`test/*`），**Ctrl+F5** 即可。

## v0.1.62 变更（会话列表修复：置顶弹窗 + 清空回收站）

- **修复弹窗层级**：从「最近删除」中触发「彻底删除 / 清空」时，通用确认弹窗因与面板弹窗同为 `z-index:100` 且 DOM 靠前而被压在下层。现为 `#confirmMask` / `#choiceMask` / `#promptMask` 设 `z-index:300`，元弹窗始终浮于普通面板弹窗之上。
- **修复 Escape / 焦点归属**：`visibleModalMask()` 改为按计算后的 `z-index`（并列时 DOM 顺序）选取最上层弹窗，避免多弹窗叠加时 Esc 关闭了被压在下面的面板。无 `getComputedStyle` 的测试环境回退为原「最后一个」行为。
- **新增「清空回收站」**：回收站标题栏加红色「清空回收站」按钮（空时自动隐藏），确认后逐个 `DELETE /session/:id` 并清空 `S.trash`；失败计数提示。
- 测试：前端纯函数单测 **37** 项、server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`js/core.js`/`js/sessions.js`），**Ctrl+F5** 即可。

## v0.1.61 变更（会话列表增强：时间 / 按天分组 / 跨助手搜索 / 最近删除）

- **时间 + 按天分组**（`sessions.js`）：会话行右侧显示相对时间（今天 `HH:MM`、昨天、今年 `MM-DD`、跨年 `YYYY-MM-DD`），悬停显示操作时自动隐藏避免抖动；列表按更新时间倒序并按天插入分组标题（今天 / 昨天 / 具体日期）。纯函数 `sessionUpdated` / `sessionDayStart` / `sessionDayLabel` / `fmtSessionTime` / `groupSessionsByDay`。
- **跨助手搜索**：会话面板新增搜索框，输入后拉取**全量会话**（`api("/session", { noDir: true })`，15s 缓存）并按「标题 / 目录 / 助手名 / 会话 id」过滤（纯函数 `filterSessions`），结果平铺显示并带助手徽标；点击结果自动切换到对应助手并打开该会话。
- **删除后恢复（最近删除）**：删除会话改为**移入本地回收站**（`S.trash`，随 `/_profile` 落盘），弹出「撤销」Toast；会话面板新增回收站入口（`#trashOpen` → `#trashMask`），可**恢复**或**彻底删除**（`DELETE /session/:id`）。列表与搜索均过滤回收站项；`session.deleted` 事件与「按助手清理」会同步清理回收站记录。
- **事件联动**：`session.updated` / `session.deleted` 改走 `refreshSessionList()`，搜索态下也能正确刷新。
- 测试：前端纯函数单测增至 **37** 项（新增 5 项）；server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`js/*`/`test/*`），**Ctrl+F5** 即可。

## v0.1.60 变更（消息翻译：低cost模型 + 可配置提示词/思考强度）

- **翻译功能**：每条消息（用户 / 助手）的操作区新增「翻译」按钮，点击后在消息下方生成译文块，可再次点击折叠 / 展开。译文用 Markdown 渲染（代码块保留）。
- **低cost模型**：新增独立的「翻译模型」设置（默认留空 = 使用当前助手模型），通过**临时会话**（`translate-scratch`，用完即删）调用，不进当前对话、不污染上下文。翻译结果只在内存缓存（`Map`，键含提示词哈希），不写入本地存储 / 备份。
- **高级设置可改 + 可重置**（设置 → 高级设置）：
  - **翻译模型**：可搜索 / 折叠提供商的模型选择器（复用 v0.1.58 的浮层，本处内联展开），带「重置」。
  - **翻译提示词**：可编辑 textarea，带「重置默认」；留空 / 等于默认即回退内置提示词。
  - **翻译思考强度**：按所选模型的 `variants` 生成选项，默认「非思考」以省成本，带「重置默认」。
  - 存 `oc_translate_model` / `oc_translate_prompt` / `oc_translate_variant`，随 v0.1.56 的自动落盘一起备份。
- **修复**：`modelDisplayName` 之前用 `findModel(ref)` 但模型引用的字段是 `id` 而非 `modelID`，导致 v0.1.58 顶栏按钮显示的是模型 **id** 而非名称；现统一归一为 `modelID` 查询。
- **实现**：新增 `static/js/translate.js`（设置项 + 翻译执行）；`providers.js` 抽出通用 `renderModelItems(box, q, current, onPick, emptyLabel, rerender)` 供顶栏与翻译模型两处复用；`core.js` 加 `globe` 图标；`render.js` 加翻译按钮。
- 测试：前端纯函数单测 **32** 项、server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`js/*`），**Ctrl+F5** 即可。

## v0.1.59 变更（多图裁剪批量化）

- **问题**：多选图片且开启裁剪时，`addFiles` 对每张图逐个弹出裁剪框，8 张就要确认 8 次，繁琐。
- **裁剪队列**：裁剪器改为**队列**模式（`media.js`）。一次选择多张（>1）时标题显示「裁剪图片（2/8）」，底部新增工具栏：**用原图 / 全部用原图 / 应用到其余**，并支持**上一张**回退（每张的裁剪状态自动保存）。按钮文案随进度变为「裁剪并下一张 / 裁剪」。
- **「应用到其余」**：用当前图片的比例与缩放（居中构图）自动裁剪剩余图片，一步完成。
- **「用原图」**：跳过该张裁剪，按普通路径处理（仍受「图片自动压缩」影响）。
- **取消**：结束本次裁剪，已确认的保留、未处理的跳过（与原单张行为一致）。
- **兼容**：单张（头像裁剪等）仍走原交互，工具栏隐藏；`cropImageFile(file, opts)` 保留为 `cropBatch([file])` 的薄封装，`profile.js` 头像裁剪不受影响。加载多图时提示「正在加载 N 张图片…」。
- **实现**：`attachments.js` 抽出 `buildAttachmentData`，`addFiles` 先收集全部文件、再对需要裁剪的图片调用一次 `cropBatch`，按原顺序合并结果（`{dataUrl}` 裁剪 / `{original}` 用原图 / `null` 跳过）。
- 测试：本次为 DOM/Canvas 交互，无新增纯函数；前端单测 **32** 项、server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`media.js`/`attachments.js`），**Ctrl+F5** 即可。

## v0.1.58 变更（顶栏模型选择：搜索 + 折叠提供商）

- **自定义模型选择器**：顶栏原生 `<select>`（provider 分组超过 200 个时难找）换成自定义控件 `#modelPick`——按钮显示当前模型名，点开是带**搜索框**的浮层列表；原生 `select` 保留但隐藏，继续作为状态载体，选择逻辑收敛到 `applyModelSelection(val)`。
- **搜索**：按「提供商名 / 提供商 id / 模型名 / 模型 id」实时过滤；匹配到提供商时展开其全部模型，匹配到模型时只列匹配项。纯函数 `filterModelGroups(providers, q)` 抽离并补单测（provider 命中展开全部、model 命中精确、无命中返回空）。回车选首个、Esc 关闭、点击外部关闭。
- **折叠提供商**：每个提供商是一个可点击分组头（显示名称 + 模型数 + 箭头），点击折叠 / 展开，状态存 `localStorage.oc_model_collapsed`（键为 provider id）并持久化；**搜索时忽略折叠**，直接展示命中结果。
- **兼容**：`updateModelSelect` 同步隐藏原生 `select`、按钮文案与 `variant-select` / 上下文圆环；无助手时按钮禁用并显示「（无助手）」。助手编辑弹窗内的模型下拉不受影响。
- 测试：前端纯函数单测增至 **32** 项；server 冒烟 8 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`providers.js`），**Ctrl+F5** 即可。

## v0.1.57 变更（快捷键 + 触屏/键盘可用性）

> 窄屏适配（原 P1-7）经确认「基本没问题」，不做；本版改做交互可用性，尽量不改界面。

- **快捷键扩展**（`core.js` `initShortcuts`，全部走 `defaultPrevented` 让位、不与既有处理冲突）：
  - **Ctrl+,** 打开设置；**Alt+N** 新建会话；**Esc** 在无弹窗时**中止当前生成**（有弹窗仍由既有逻辑关闭弹窗）。
  - 输入框：**Ctrl/Cmd+Enter** 发送；原 **Enter 发送 / Shift+Enter 换行** 保持不变。
  - 既有 **Ctrl+F** 搜索保留。设置 → 高级设置新增「快捷键」说明（纯文本，不改布局）。
- **触屏（`@media (hover: none)`，桌面视觉零变化）**：无悬停设备上**常显**树行 / 会话行的操作按钮与消息操作，并放大 `mini-btn` / `msg-action` 点按区，解决「触屏点不到 hover 才出现的按钮」。
- **键盘可用性**：
  - 树行 / 会话行加 `tabIndex`，**Enter / Space 激活**（内部按钮自身回车不受影响，`target !== node` 时才处理）；`:focus-within` 时展开隐藏的 `row-actions`，使删除 / 重命名等可被 Tab 到达；`:focus-visible` 显示焦点环。
  - 全项目按钮的 `title` 自动同步为 `aria-label`（`syncAriaLabels`，静态 + 动态行均覆盖），补齐图标按钮的可访问名。
- 说明：消息操作区原本就用 `opacity` 且已支持 `:focus-within`，键盘可达，无需改动。
- 测试：本次为 DOM/CSS 交互改动，无新增纯函数；前端单测 **31** 项、server 冒烟 **8** 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`js`），**Ctrl+F5** 即可。

## v0.1.56 变更（数据自动落盘 + 按助手清理记录）

- **本地数据自动保存（落盘 JSON）**：新增服务端 `/_profile`（`server.py`）——`GET` 读、`POST` 写，落到 `~/.config/opencode-chat/profile.json`（原子写：先 `.tmp` 再 `os.replace`），受既有 token／同源守护；文件只存 `oc_*` 前缀的 localStorage 键值（工作区、草稿、回复版本、外观、用户资料等），**不涉及任何 API Key**（Key 仍由服务端 DPAPI 管理）。
- **前端自动备份**：`state.js` 新增 `snapshotLocalStorage` / `saveProfile` / `flushProfile` / `initProfileAutosave`。启动后每 **4s** 对比快照、有变化才 POST；`visibilitychange`（转后台）与 `beforeunload` 走 `navigator.sendBeacon` 立即落盘。`boot()` 时若 `localStorage` 无工作区（浏览器数据被清/换机），自动 `GET /_profile` 恢复，**不丢配置与草稿**。
- **导出 / 导入**：设置 → 高级设置 → 数据备份，支持「导出 JSON」（下载 `opencode-chat-backup-*.json`）与「导入 JSON」（校验后写回并刷新）；纯函数 `applyProfileObject` 只接收 `oc_` 前缀字符串键，坏文件报错不写入。
- **按助手清理记录**：设置 → 高级设置 → 「按助手清理记录」打开 `#cleanupMask`，列出各助手及其工作区，危险确认后删除该助手的全部 opencode 会话，并同步清理本地**草稿 / 收藏 / 最近打开（`S.last`）**；正在查看的会话被清则回到空态。不影响其他助手。
- 测试：新增 server `/_profile` 往返用例（含 403 未授权），server 冒烟 **8** 项；前端纯函数单测增至 **31** 项（`applyProfileObject`）；全绿。
- 生效方式：改动含 **`server.py`**，需**重启 `server.py`** 后 **Ctrl+F5**。

## v0.1.55 变更（桌面通知）

- **桌面通知开关**：设置新增「桌面通知」开关（`#notifyToggle`，存 `oc_notify`，默认关闭）。开启时按需调用 `Notification.requestPermission()`；未授权 / 环境不支持则提示并自动回退开关状态。用 `showToast` 反馈。
- **触发时机**（`events.js`）：① 当前会话 `session.idle`（回复完成，带会话标题）；② `permission.asked`（带权限名与 pattern）；③ `question.asked`（带问题标题）。三处均调用 `notifyDesktop(title, body, tag)`。
- **只在该弹才弹**：纯函数 `canNotify(hidden, enabled, permission)` 约束为 **已开启 + 权限 granted + `document.hidden`（窗口失焦）** 三者同时满足；`enable` 为存储开关、`hidden` 用 `document.hidden` 判断，避免在用户正看着窗口时打扰。点击通知会 `window.focus()` 并关闭。
- 与既有设置一致：逻辑放 `core.js`（`notifyEnabled` / `canNotify` / `notifyDesktop`），开关放 `settings.js`；纯函数 `canNotify` 补单测。
- 测试：前端纯函数单测增至 **30** 项；server 冒烟 7 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`js`），**Ctrl+F5** 即可（首次开启需在浏览器弹窗中允许通知）。

## v0.1.54 变更（跟随系统主题）

- **外观模式改为独立三段选项**：设置 → 外观由原「暗色主题」开关改为 **亮色 / 暗色 / 跟随系统** 分段控件（`#themeSeg`），状态存既有键 `oc_theme`（`light` / `dark` / `auto`，旧的 `dark` / `light` 值向后兼容，默认 `light`）。
- **跟随系统**：`matchMedia("(prefers-color-scheme: dark)")` 读取系统偏好，并监听 `change` 事件；仅在 `auto` 模式下随系统实时切换，`light` / `dark` 保持用户显式选择不受系统影响。逻辑集中在 `core.js`（`themeMode` / `isDarkMode` / `applyThemeMode` / `initThemeMode`），已从 `send.js` 移出原 `applyTheme`。
- **避免冲突**：不做 `@media (prefers-color-scheme)` 的纯 CSS 覆盖（那会与手动浅/深色互相覆盖），统一由 JS 依据模式在 `<body>` 上增删 `dark`；与 v0.1.52 的**主题色**互不影响（强调色仍以 `documentElement` 内联变量覆盖）。同时给 `:root` / `body.dark` 补 `color-scheme`，让原生控件与滚动条随模式正确配色。
- 测试：新增 `isDarkMode` 三态用例（含 `matchMedia` 桩），前端纯函数单测增至 **29** 项；server 冒烟 7 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`js`），**Ctrl+F5** 即可。

## v0.1.53 变更（体验 P0：不丢内容 / 统一弹窗 / 错误修复入口）

- **发送失败不再丢内容**：原 `send()` 在 `postPrompt` 之前就清空输入框、草稿与附件，失败仅提示，内容全部丢失。现改为**成功后才清理**：失败时输入与附件原地保留（提示「内容已保留，可直接重试」）；成功时仅清除本次发送的那个文本（若等待期间用户又输入了内容则保留）与本次的附件（等待期间新加的附件不受影响）。`static/js/send.js`。
- **统一弹窗，去掉原生 `alert/confirm`**：新增通用确认弹窗 `#confirmMask`（`core.js` `confirmDialog(opts)` 返回 Promise，支持标题/正文/确定文案/危险态，`role=dialog`+焦点陷阱+Esc 关闭已并入既有 `MODAL_ESC`）。全项目 **17 处**原生弹窗清零：
  - 删除类（删文件夹 / 删助手 / 删会话 / 清除明文密钥）改用红色危险确认按钮；
  - 校验与失败提示（助手名/工作区/温度/topP/系统提示词、新建·重命名·删除失败等）改用 `showToast(msg, true)`，进入既有「最近错误」面板。
- **删除可撤销**：`showToast` 支持操作按钮（`showToast(msg, isError, { label, onClick })`，带按钮时展示 6s 且 `pointer-events:auto`）。删除**文件夹 / 助手**后弹「撤销」，可恢复列表、收藏态与当前激活项；删除会话属服务端不可逆操作，仅保留危险确认、不提供撤销。
- **认证错误附修复入口**：`renderMessageError` 识别 401/403 / `unauthorized` / `forbidden` / API key 无效等认证类错误时，在错误气泡内追加「去服务商重连」按钮，一键打开 `#providerMask`。纯函数 `isAuthErrorText` 抽离并补单测（含 429、model not found 等反例）。
- 测试：前端纯函数单测增至 **28** 项；server 冒烟 7 项不变，全绿。
- 生效方式：纯前端改动（`index.html`/`app.css`/`js`），**Ctrl+F5** 即可。

## v0.1.52 变更（主题色换皮）

- **内置 8 套主题色**：设置 → 主题色新增一排圆形色板，点击即换。预设：青绿（默认）、海蓝、靛紫、樱粉、日落橙、绯红、青碧、石墨。选择存 `localStorage`（键 `oc_accent`），启动即恢复。
- **实现**：`core.js` 新增 `ACCENT_PRESETS` / `accentPreset` / `hexToRgba` / `applyAccent`——把主色及其派生色（`--accent-soft` / `--accent-strong` / `--accent-bright` / `--accent-weak` / `--accent-glow` / `--focus` / `--user-bubble`）写到 `document.documentElement` 内联变量，并同步 `<meta name="theme-color">`；`settings.js` 渲染色板（`renderAccentPicker`）。
- **CSS 去硬编码**：`body.dark` 不再声明强调色系变量（否则会盖掉换皮结果），改由 `:root` + 内联覆盖；`app.css` 里散落的 `#10a37f` / `#16e0b0` / `#14b891` / `rgba(16,163,127,…)` 统一改为 `var(--accent*)`（呼吸灯、hosting 动效、工具状态、选中态、拖拽遮罩、用户气泡渐变等）。
- **配套**：色板样式（选中描边 + 勾选）；`hexToRgba` / `accentPreset` 补单测，前端纯函数单测增至 **27** 项；server 冒烟 7 项不变，全绿。
- 生效方式：纯前端改动，**Ctrl+F5** 即可。更换主题色即时生效，无需刷新。

## v0.1.51 变更（风格统一与美化）

- **设计变量集中化**：`app.css` 的 `:root` / `body.dark` 新增一套统一令牌——圆角（`--r-xs/sm/md/lg/pill`）、毛玻璃模糊（`--glass-blur`）、悬浮底色（`--hover` / `--track`）、弹窗底色（`--modal-bg`）、阴影（`--shadow-sm/md/lg`）、焦点环（`--focus`）、过渡（`--t-fast`）与强调色变体（`--accent-strong` / `--accent-weak`）。主色保持青绿 `#10a37f`。
- **弹窗改为暗色毛玻璃**：`.modal` 由不透明 `var(--bg)` 改为 `var(--modal-bg)` + `backdrop-filter: blur(var(--glass-blur)) saturate(1.2)`，配 `--r-lg` 圆角与 `--shadow-lg`；遮罩层加轻微模糊；弹出有 `modalIn` 微动效（`prefers-reduced-motion` 下关闭）。
- **范围滑杆统一**：此前 `input[type=range]` 是浏览器默认蓝色，与主色冲突。现用 `-webkit-`/`-moz-` 轨道与滑块统一为「青绿已填充 + 中性未填充 + 白底青边圆钮」；`core.js` 新增 `syncRangeFill` / `initRangeFills`（`boot()` 调用，输入时以捕获监听更新 `--range-fill`）。
- **开关 / 焦点 / 按钮统一**：`.switch` 关闭态改用 `--track` 并带边框，开启态青绿、键盘聚焦显示 `--focus` 环；表单输入/下拉/文本域聚焦统一为青边 + 焦点环；`.btn-allow/.btn-always/.btn-reject/.btn-cancel`、`.msg-action`、`.icon-btn` 等统一过渡与 `:active` 微下压，`focus-visible` 统一焦点环。
- **质感细节**：侧栏/顶栏模糊提升为 `--glass-blur` 并加 `saturate`；助手气泡圆角与浅阴影、用户气泡改青绿渐变；工具块圆角、思考块右侧圆角；上下文浮层 / 托管浮层 / 回到底部 / Toast 统一毛玻璃底纹与阴影；`.row.active` / `.session-list li.active` 统一用 `--accent-weak`。
- 说明：气泡未加逐条 `backdrop-filter`，避免超大会话重复合成造成卡顿（沿用 v0.1.42 的性能取向）。
- 生效方式：纯前端改动，**Ctrl+F5** 即可。

## v0.1.50 变更（缺陷修复）

- **修复生成中「上下文」归零**：opencode 在助手消息开始生成时即创建该条消息，其 `tokens` 尚未上报（全为 0）；原 `latestAssistantInfo` 只按 `time.created` 取最新一条，于是每次生成新回复的瞬间，顶栏上下文圆环与「本会话用量」浮层的上下文都会掉到 `0 / <窗口>`，生成结束才恢复。现改为**优先取最近一条有实际用量的助手消息**（`pickLatestAssistant`），生成中沿用上一轮的上下文值，不再归零。
- 逻辑抽成纯函数 `pickLatestAssistant` 并补单测（零 token 的在生成消息被忽略、全部为零时回退到最新一条），前端纯函数单测增至 **25** 项；server 冒烟 7 项不变，全绿。
- 生效方式：纯前端改动，**Ctrl+F5** 即可。

## v0.1.49 变更（可访问性）

- **模态语义**：页面加载时给所有 `.modal` 统一补 `role="dialog"` 与 `aria-modal="true"`（`core.js` `initModalA11y`），屏幕阅读器可识别为对话框。
- **Escape 关闭**：按 Esc 关闭「最上层」可见模态。实现上映射到各模态既有的关闭/取消控件（如 `astCancel`、`promptCancel`、`cropCancel`、`oauthCancel`…），从而照常触发其清理回调（草稿/裁剪/轮询等）；**权限确认 `permMask` 故意不允许 Esc 关闭**，避免误关导致未决策。
- **Tab 焦点陷阱**：Tab/Shift+Tab 在打开的模态内循环；若焦点跑到模态外则拉回首个可聚焦元素。图片查看器与其自身 Esc、搜索框的方向键/Esc 行为保持原样。
- 生效方式：纯前端改动，**Ctrl+F5** 即可。

## v0.1.48 变更（可观测性）

- **`server.py` 可选日志文件**：设置环境变量 `OC_LOG_FILE=<路径>` 时，启动横幅与每条请求日志（沿用 token 脱敏）以时间戳前缀**追加写入**该文件，同时仍输出到 stderr；`Server.handle_error` 也会记录非连接类异常。目录不存在时自动创建；未设置则行为不变。
- **前端「最近错误」面板**：设置 → 高级设置新增「最近错误」，记录最近 **50** 条（`pushError`），来源包括 `api`（网络错误 / 非 2xx，含路径与状态码）、`toast`、`notice`、`model`（模型调用失败）、`js` / `promise`（`window` 的 `error` / `unhandledrejection`）；同来源同内容 3 秒内去重，面板可「清空」。用于事后定位（例如模型 401/403、API 404、脚本异常）。
- 测试：新增 `pushError` 去重与容量上限用例，前端纯函数单测增至 **24** 项；server 冒烟 7 项不变，全绿。
- 生效方式：重启 `server.py`（日志文件）+ **Ctrl+F5**（前端面板）。

## v0.1.47 变更（测试保护网）

- **前端纯函数单测**：`test/_dom.js` 用 Node 内最小 DOM 桩，按 `index.html` 的加载顺序把 14 个经典脚本拼成**单个脚本**执行（规避跨文件 `const` 作用域问题），把纯函数挂到 `globalThis.__pure`；`test/pure.test.js` 覆盖 23 项：`modelKey/parseModelKey`（含 `/` 的模型 ID）、发送时间戳往返、`D2` 工作区去重复用、mime/大小格式化、token/费用换算、搜索转义与高亮、代码段保护/还原、托管转录等。
- **server 冒烟测试**：`test/test_server.py`（`unittest`，随机端口起 `Server`）7 项——index 200 + CSP/`nosniff`/`no-referrer` + 响应内无 `__OC_TOKEN`、无令牌 403、带 Cookie `/_mkdir` 200、`/_models` 404、白名单外 `/api/auth` 404、路径穿越 `/../server.py` 404、`woff2` 字体 MIME 正确。
- **统一入口**：`tools/test.bat` 依次跑 `node --test` 与 `python -m unittest`（两者任一失败即非零退出）。
- 说明：`rollback.bat` 的 preflight 仍只做语法检查（`node --check` + `py_compile`），不自动跑测试；发版前可手动运行 `tools\test.bat`。
- 生效方式：仅新增测试与脚本，不影响运行；未改 `server.py`/前端，无需重启。

## v0.1.46 变更（缺陷修复与死代码清理）

- **`finalizeMarkdown` 兜底**：除 `session.idle` 外，`setBusy(false)` 也调用一次 `finalizeMarkdown()`，避免流因错误/中止未发 `idle` 时助手气泡停留在纯文本（Markdown 未渲染）。
- **删除孤文件** `fireworks.html`（根目录、无引用、不在 `static/` 下不被服务）。
- **删除 `server.py` 死代码**：`/api/_models` 路由与 `_models` 方法（前端从未调用；移除后请求按白名单走 `/api/_proxy` 并 404，已实测）。
- **`usedDirs` 载入归一**：`state.js` `loadStore` 对持久化的 `usedDirs` 逐项 `normDir` 归一，兼容手工/旧数据。
- **`rollback.bat` 回滚更彻底**：回滚时整目录替换 `static/`，顺带清理快照中不存在的额外文件（原实现只删 `js`/`css`，残留文件会留存）。
- 验证（临时端口 8011）：index 200、Cookie-only `/api/path` 200、`/api/_models` 404；`py_compile` + 相关 `node --check` 通过。
- 生效方式：重启 `server.py` + Ctrl+F5。

## v0.1.45 变更（P2-b：bash 长任务可控性）

- **问题定位**：用户遇到「简单 bash 跑六分钟、超时不触发、最后手动中止」。排查实测（opencode 1.18.30）：多例 bash 设 `timeout=60000/120000ms`，实际分别跑了 360s/385s，均以 `interrupted=true / Tool execution aborted` 结束（即人工中止，非超时）。
- **根因**（读 opencode 内嵌实现）：bash 工具用 `raceAll([进程 exitCode → "exit"，abort → "abort"，sleep(timeout+100ms) → "timeout"])`，超时才执行 `kill`。命令若用 `Start-Process`/`Start-Job` 起了后台子进程，**直接进程很快退出使 `exitCode` 抢先胜出，timeout 分支永不触发**；而子进程仍占着 stdout/stderr，输出流 `D.all` 一直不结束，工具便永久停留在 `running`，直到用户中止。改重定向到文件也无法避免（实测如此）。**这属 opencode 在 Windows 上对后台子进程的处理缺陷，前端/插件无法根治**；普通长命令（不带后台子进程）的超时逻辑本身正常。
- **缓解（本版落地）**：运行中的工具块
  1. **每秒自走计时**（不再只在收到事件时才刷新）；
  2. 显示**「中止」按钮**，一键 `abort` 当前回复，不必再干等；
  3. 运行超过 90s 时高亮为红色（`t-stuck`，疑似后台进程占用输出未结束）。
- **版本一致性**：`VERSION` 升至 `0.1.45`，`tools/release.bat` 重写 exe 为 `0.1.45.0`；`release.bat` 增加「CHANGELOG 是否含 `v<版本>`」漂移校验，`rollback.bat backup` 增加「快照标签是否与 `VERSION` 一致」校验（不一致仅告警）。
- 生效方式：纯前端改动，**Ctrl+F5** 即可。后续如需根治，得避开 agent 使用 `Start-Process` 起后台进程，或等 opencode 修复（exitCode 胜出后仍应等待/清理子进程句柄）。

## v0.1.44 变更（P1-c：版本单一来源 + 插件源码入库）

- **版本单一来源 `VERSION`**：新增仓库根 `VERSION`（当前 `0.1.44`），作为版本号唯一真相；`opencode-chat.exe` 的 PE 版本信息由它驱动。
- **`tools/release.bat`**：读取 `VERSION`，用 **rcedit**（缺失时自动从 electron/rcedit 下载 `rcedit-x64.exe`，下载失败则告警跳过）写入 `opencode-chat.exe` 的 `FileVersion` / `ProductVersion`（`X.Y.Z.0`）。已实测：`FileVersion=0.1.44.0  ProductVersion=0.1.44.0`。`rcedit-*.exe` 已加入 `.gitignore`。
- **插件源码入库**：仓库新增 `plugin/base-override.ts` 为**源码真相**（此前仅安装态 `~/.config/opencode/plugin/` 存在）。新增根 `install-plugin.bat`：把仓库源码拷到安装目录，并校验 `~/.config/opencode/opencode.jsonc` 已注册 `./plugin/base-override.ts`（未注册时打印需补的配置）。
- **`rollback.bat` 调整**：快照纳入 `VERSION`，插件改为从仓库 `plugin/` 快照；回滚时把 `base-override.ts` 同时恢复回仓库 `plugin/` 与安装态 `~/.config/opencode/plugin/`。旧快照（快照根为 `base-override.ts`）仍兼容恢复。
- 生效方式：`release.bat` 改 exe 版本无需重启；`install-plugin.bat` 改动插件后需**重启 opencode**；`rollback.bat` 内容改动立即生效。

## v0.1.43 变更（P2-a：依赖本地化 + CSP）

- **前端依赖全部本地化，移除 CDN**：将 `marked@18.0.12`、`highlight.js@11.9.0`（js + `github-dark` 主题 css）、`katex@0.16.11`（js + css + 20 个 woff2 字体）下载到 `static/vendor/`，`core.js` 的 URL 由 `cdn.jsdelivr.net` 改为 `/vendor/*`。此前任一 CDN 被篡改即可读取页内令牌并调用本地 API 执行命令；DOMPurify 本地化只堵了 Markdown 注入，本版把第三方脚本面清空。KaTeX CSS 字体路径已随 `static/vendor/fonts/` 落地。
- **收掉页内令牌（纯 Cookie 鉴权）**：`server.py` 不再向 `index.html` 注入 `window.__OC_TOKEN`，前端 `api()` 不再发送 `X-OC-Token` 头，完全依赖 v0.1.41 下发的 `HttpOnly; SameSite=Strict` Cookie；`_guard` 仍兼容 Header/query，便于排查。这也是 CSP 能禁内联脚本的前提。
- **CSP + 安全响应头**：静态 HTML 响应新增 `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`，并统一加 `X-Content-Type-Options: nosniff` 与 `Referrer-Policy: no-referrer`（静态与 JSON 接口）。非 `index.html` 预览页的「返回应用」内联脚本用**每次响应的 nonce** 放行，保持 Esc 返回可用。`server.py` 补 `.woff2/.woff/.ttf/.otf` MIME。
- 验证（临时端口 8010，不影响运行中的 8000）：`/` 200 且 CSP 生效、响应内不再含 `__OC_TOKEN`；Cookie-only `/api/path` 200；`/vendor/marked.min.js` 200（`application/javascript` + nosniff）；`/vendor/fonts/KaTeX_Main-Regular.woff2` 200（`font/woff2`）。`node --check` ×15 + `server.py` `py_compile` 通过。
- 生效方式：**重启 `server.py` 并 Ctrl+F5**（`server.py` 与前端均已改动；opencode 插件与本体无需重启）。

## v0.1.42 变更（P1-b：性能与工作区）

- **超大会话 idle 假死修复（增量 finalize）**：流式期间只把被触碰的消息 id 记入 `dirtyMsgIds`，`session.idle` 仅重渲这些消息的气泡，不再全量重渲整个会话。此前单消息可达 ~27.6 万 token、含数百 tool/patch 部件的 agent 会话，在 idle 全量重渲 + DOMPurify 净化时会导致页面假死。涉及 `state.js` / `events.js` / `sessions.js`。
- **工作区目录不复用（D2）**：`S` 新增持久化 `usedDirs`（`loadStore` 用现存助手目录播种），新建/复制助手时写入、删除助手不回收；`uniqueWorkspace` 同时比对 `usedDirs`。修复删除助手后同名新建会落回旧目录并带回旧会话的问题。
- **托管转录分页（P3）**：经实测确认 opencode `GET /session/{id}/message?limit=N` 返回**最新 N 条**（升序），`proxy.js` 组装托管转录时改用 `?limit=RP_PROXY_TRANSCRIPT_LIMIT`（40）取代全量拉取，避免为取最近 40 条而加载整段超大历史。
- **托管临时会话清扫**：`runProxyStep` 开头也清扫一次 `hosting-scratch`，避免长会话内多次托管时残留累积。
- 生效方式：纯前端改动，**Ctrl+F5** 即可（`server.py`、opencode 插件与本体无需重启）。已验证 15 个 JS `node --check` 通过。

## v0.1.41 变更（P1-a：代理收敛 + 令牌 Cookie）

- **代理上游路径白名单**：`server.py` 的 `_proxy` 仅放行前端实际使用的上游接口——精确 `/config/providers`、`/experimental/tool/ids`、`/file`、`/path`、`/agent`、`/event`，前缀 `/session`、`/provider`、`/question`；其余一律 404 并记录 `[proxy] blocked`。可用环境变量 `OC_PROXY_DRYRUN=1` 切换为「仅记录不拦截」以便观察。收窄了「持有令牌即可调用 opencode 全量 API」的攻击面。
- **令牌 Cookie 化（保守半程）**：托管 `index.html` 时下发 `Set-Cookie: oc_token=<随机>; HttpOnly; SameSite=Strict; Path=/`；`_guard` 按「Header → query → Cookie」顺序取令牌。前端 `EventSource` 不再把令牌放进 URL（改由同源 Cookie 自动携带），消除令牌进入访问日志的路径；`server.py` 日志进一步对 `token=` 做脱敏。
- 本版**保留**页内 `window.__OC_TOKEN` 注入与 `X-OC-Token` 头（`api()` 行为不变），确保零破坏；移除页内令牌留待后续版本。
- 验证（独立端口 8010，不影响运行中的 8000）：Cookie-only `/api/path` 200、无令牌 403、Header 200、白名单外（`/auth` `/log` `/config` `/tui/...`）404、`/api/event` SSE（Cookie）200。
- 生效方式：重启 `server.py` 并 **Ctrl+F5**（旧页面无新 Cookie，不刷新会 403）。

## v0.1.40 变更（安全与可靠性 P0）

- **Markdown 渲染净化（XSS → RCE 链路切断）**：引入本地 `static/vendor/purify.min.js`（DOMPurify 3.1.6），`renderMarkdown` 在写入 `innerHTML` 前统一经 `DOMPurify.sanitize`（放行 KaTeX MathML 所需标签/属性）；DOMPurify 缺失时回退为纯文本，不再注入未净化 HTML。此前恶意 Markdown（如 `<img onerror>`）可窃取页内 `window.__OC_TOKEN` 进而调用 opencode API 执行命令。
- **托管临时会话隔离与清扫**：托管生成不再把临时会话建在助手工作区，而是建在专用目录 `~/.config/opencode-chat/hosting-scratch`；`boot()` 启动时清空该目录全部会话。修复「生成中断/关闭页面后临时会话残留，出现在会话列表与用量统计」的问题。
- **静态目录穿越加固**：`server.py` 静态托管路径判断由 `startswith(STATIC_DIR)` 改为「分隔符 + 大小写归一」比较，修复同级 `static*` 目录潜在绕过。
- **托管并发守卫**：`regenerate()` 与 `editUserMessage()` 新增 `rpProxyRunning` 守卫，避免托管生成期间误触删除/重发造成消息竞争。
- **快照预检**：`rollback.bat backup` 在创建快照前自动运行 `node --check`（全部 `static/js/*.js`）与 `py_compile`（`server.py`），任一失败即中止快照（`list`/`rollback` 不受影响）。已实测通过/失败两条路径。
- 生效方式：重启 `server.py` 并 **Ctrl+F5**（`server.py` 与前端均已改动；opencode 插件与本体无需重启）。

## v0.1.39 变更

- **「RP 代打」正式更名为「对话托管」**：输入栏魔棒按钮、弹层标题、选项与提示文案统一为「对话托管 / 托管一步 / 自动托管 / 托管助手」（内部标识 `oc_rp_proxy`、`proxy.js` 不变）。
- 托管时**贴出托管模型的思考内容**：若托管模型产生推理（reasoning）内容，聊天区底部显示「托管思考 · <模型名>」块（可点 `×` 收起），随生成实时刷新、完成后定格；无推理则不显示。该块为临时展示——切换会话/助手或下一次托管时清除，刷新页面后不保留。
- 输入栏新增**托管动效**：托管运行（手动或自动）时输入栏顶部有青色流光扫过并轻微呼吸、魔棒按钮高亮，与普通发送区分；系统开启「减少动态效果」时静止。
- 托管流程不变（临时会话生成、不污染主会话、自动轮数上限 20）。

## v0.1.38 变更

- 助手管理新增 **复制助手**：助手树每行操作区增加「复制」按钮，一键复制该助手的全部配置（名称、图标、头像、文件夹、Agent、模型、思考强度、温度/topP、系统提示词、顶掉基底 / 纯净输入 / Git 安全开关、工具开关），**不附带任何对话**。
- 副本自动命名 `原名（1）`、`原名（2）`…（复制副本时先去掉已有数字后缀再递增，避免出现 `（1）（1）`）；在 `%USERPROFILE%\opencode-workspaces\<副本名>` 新建独立工作区目录，因此会话列表为空；复制不切换当前助手，只提示结果。
- 纯前端，刷新页面（Ctrl+F5）即可。

## v0.1.37 变更

- 新增 **对话托管**（初版名为「RP 代打」，v0.1.39 更名）：用指定助手代替「用户」一方生成下一条发言，并作为你的消息发回当前会话（可手动「托管一步」，也可「自动托管 N 轮」，N 上限 20）。
- 交互：输入栏「魔棒」按钮打开托管弹层，选择托管助手（存 `localStorage` 键 `oc_rp_proxy`，全局记忆）；「托管一步」生成一次，「自动托管」按轮数循环，运行中按钮变为「停止」可随时取消。
- 实现（纯前端 + 现有 API，不改 `server.py` 与插件）：把当前会话最近 40 条消息转录进**临时会话**（`POST /session` → `prompt_async` → 轮询 `/session/{id}/message` 直到 `time.completed` → `DELETE /session/{id}`），由托管助手的模型 + 系统提示词生成用户下一句；托管请求禁用全部工具、并以 `[[OC_BASE_OVERRIDE]]` 顶掉 opencode 基底，保证纯角色扮演输出。
- 托管生成走临时会话，不污染当前会话记录；生成结果通过 `postPrompt` 作为普通用户消息发出，因此现有发送/重生成/编辑流程不受影响。
- 自动模式在 `session.idle` 后驱动下一轮；切换助手/会话、手动发送、编辑或重新生成都会停止自动托管。
- 生效方式：刷新页面（Ctrl+F5）即可；opencode 插件与本体无需重启。

## v0.1.36 变更

- **前端结构拆分（可维护性重构）**：原 5349 行单文件 `static/index.html`（内联 CSS+JS）拆为 `static/index.html`（仅 HTML 骨架，528 行）+ `static/css/app.css`（原 15–858 行样式）+ `static/js/*.js`（14 个脚本，按原注释分区顺序加载：`core / profile / state / assistants / sessions / render / events / attachments / send / settings / media / providers / favorites / boot`）。
- 拆分采用**经典脚本按原顺序加载**（非 ES Module），完整保留原全局作用域语义，未改动任何业务逻辑；全部 JS 已通过 `node --check` 语法校验，并逐一核对顶层立即调用无跨文件依赖。
- `server.py`：静态托管的 `Cache-Control: no-store` 由仅 `index.html` 扩展到 `.html/.js/.css`，避免开发期浏览器缓存旧脚本。
- `rollback.bat`：快照与回滚改为备份**整个 `static/` 目录**（原仅 `static/index.html`）；回滚兼容旧快照（快照根为单个 `index.html` 时自动走旧路径）。已用新脚本生成首份整目录快照 `backups/pre-split-v0.1.35-<时间戳>` 作为回滚基线。
- 兼容性：`server.py` 注入的 `window.__OC_TOKEN` 仍内联在 `index.html` `<head>`，外部脚本加载顺序在其后、token 可用；非 `index.html` 的 `.html` 预览「返回应用」浮层逻辑不变。
- 生效方式：重启 `server.py` 并 **Ctrl+F5**（纯前端结构变更，opencode 插件与本体无需重启）。

## v0.1.35 变更

- 把「背景图片 / 背景遮罩」从「高级设置」挪回主设置区（放在「暗色主题」之后）——情绪价值拉满。「高级设置」现含：图片自动压缩、聊天图片裁剪、费用单位、工具超时、用量统计。纯前端，刷新即可。

## v0.1.34 变更

- 精简设置面板：常用项（暗色主题、字体大小、助手文本居中、显示 Token、服务商与模型）保持外露；低频项（背景图片/遮罩、图片自动压缩、聊天图片裁剪、费用单位、工具超时、用量统计）收进可折叠的**「高级设置」**（`#moreToggle` / `#moreBody`），展开状态记于 `oc_settings_more`。纯前端，刷新即可。

## v0.1.33 变更

- 修复上下文圆环一直显示灰色：初始内联 `style` 里的 `stroke-dashoffset` 优先级高于 `setAttribute`，进度弧永远停在满偏移而看不见；改用 `arc.style.strokeDasharray/strokeDashoffset` 设置。
- 设置新增「费用单位」：可填货币符号（如 `¥`）与汇率（每 1 USD 折合多少单位，如 `7.2`），所有费用显示（消息徽标、会话汇总、上下文浮层、用量统计）按汇率换算；留空汇率 = 1（美元原值）。纯前端，刷新即可。

## v0.1.32 变更

- 顶栏新增**上下文圆环**（在会话 Token 汇总右侧）：SVG 圆环显示「最近一次请求的上下文 ≈ 输入 + 缓存读 + 输出」占模型上下文窗口（`model.limit.context`）的比例；<70% 绿、≥70% 橙、≥90% 红；窗口未知（如自定义模型）显示空心环，悬停提示数值。
- 点击圆环弹出**详细用量**浮层：模型名、上下文 used/limit、剩余及百分比、本会话 输入/输出/思考/缓存读/写、费用；点击别处关闭。
- `loadModels` 现携带 `limit`；`refreshSessionTokens` / `updateModelSelect` 时刷新圆环；设置里隐藏 Token 用量时一并隐藏圆环。纯前端，刷新即可。

## v0.1.31 变更

- 修复：**自定义模型**（手动添加的模型 ID）被前端误判为「不支持图片输入」而拦截。opencode 对未知自定义模型给出的能力默认值 `attachment:false` 并非真实能力；现对自定义模型跳过前端能力拦截（`isCustomModel()`，依据 `/_secret` 返回的 `models` 列表），交由模型/服务端判断。`boot()` 时预取 `loadLocalSecrets()` 以保证启动即生效。
- 实测：opencode 对自定义模型会正常尝试处理图片附件（未因能力默认值丢弃）。纯前端，刷新即可。

## v0.1.30 变更

- 新增**活动呼吸灯**：当前活动助手（助手树）与当前会话（会话列表）名称右侧各显示一个绿色小圆点，`oc-breathe` 呼吸动画；生成中变为更亮的青色并加快脉动（`.busy`）。系统开启「减少动态效果」时静止。
- 修复：生成中 `session.updated`（标题刷新）会重渲会话列表，导致呼吸灯丢失 `.busy`；现渲染时即按 `busy` 直接带类，`setBusy()` 仍即时切换。纯前端，刷新即可。

## v0.1.29 变更

- 新增**编辑已发送消息**：用户消息加「编辑」按钮，弹出多行编辑框；保存后删除该消息及其后全部对话，再以新内容重新发送（原附件保留）。删除采用**从末尾逐条**方式，每次只删当前最后一条，因此含 tool 消息也安全。
- 新增**回复版本快照（本地）**：每次「重新生成」前把被替换的回复文本存入 `localStorage`（键 `oc_replies`，按 `会话ID + 用户消息正文哈希` 归组，每轮最多 8 版，总量上限约 120 组）；助手消息底部出现 `◀ 版本 n/N ▶`，可查看历史版 / 回到最新（历史版以虚线气泡显示，复制按钮只复制当前显示的版本）。
- 语义说明：后端始终只保留最新版本，历史版本仅本地展示；编辑消息正文后，该轮历史版本不再关联（对话已被截断）。
- 附：实测 opencode `POST /session/{id}/revert` **不会截断消息**（消息列表不变），故编辑未采用 revert。纯前端改动，刷新即可。

## v0.1.28 变更

- 新增工作区版本管理批处理 **`rollback.bat`**（防写崩、可回滚）：
  - `rollback.bat backup [标签]`：把当前 `server.py`、`static/index.html`、插件 `~/.config/opencode/plugin/base-override.ts`、`CHANGELOG.md` 快照到 `backups\<标签>-<时间戳>\`（默认标签 `stable`）。
  - `rollback.bat`（等价 `rollback.bat rollback`）：自动回滚到 `backups\` 中**最新**的快照；回滚前会把当前状态另存为 `pre-rollback-<时间戳>\` 安全快照，因此回滚本身也可再回滚。
  - `rollback.bat list`：列出快照；`rollback.bat <名称>`：回滚到指定快照。
  - 已内置稳定快照 `backups/v0.1.27-<时间戳>`（含 v0.1.27 全部改动）。回滚后需重启 `server.py` 与 opencode 并刷新页面。

## v0.1.27 变更

- 新增**草稿保存**：聊天输入框内容按会话自动存到 `localStorage`（键 `oc_drafts`，`{sessionId: text}`），切换会话 / 切换助手 / 刷新页面后自动恢复；发送后清除，删除会话时一并清除其草稿。
- 输入时 300ms 防抖写入（按输入时的会话快照写入，避免切换后写错会话）；切换会话 / 切换助手前先落盘当前草稿；`beforeunload`/`pagehide` 时再兜底落盘。纯前端，刷新页面即可。

## v0.1.26 变更

- 新增**图片裁剪**：头像（用户/助手）与聊天图片上传前弹出裁剪框，可拖拽平移、滚轮/滑杆缩放，并可选比例（原始 / 1:1 / 4:3 / 3:4 / 16:9 / 9:16）。
- 头像裁剪固定 1:1，输出最大 256px webp；聊天图片裁剪输出最大 1024px、保留原格式族（PNG 保留，其余 webp/jpeg），附件显示「已裁剪」徽标。
- 新增设置项「聊天图片裁剪」（`oc_img_crop`，默认开）：关闭后聊天图片跳过裁剪步骤，仍受「图片自动压缩」影响；头像始终可裁剪。
- 纯前端改动，刷新页面即可。

## v0.1.25 变更

- **代理安全加固**（防本地 CSRF / 恶意网页借代理执行 bash / 明文密钥泄漏）：
  - 每次启动生成随机 `SESSION_TOKEN`；所有 `/api/*` 请求必须携带 `X-OC-Token`（`EventSource` 用 `?token=`）。`server.py` 在托管的 `index.html` 里注入 `window.__OC_TOKEN`，前端 `api()` 自动附带；token 不符一律 403。
  - 校验 `Origin`（仅允许 `http://127.0.0.1:<port>` / `http://localhost:<port>`）与 `Sec-Fetch-Site`（仅 `same-origin`/`none`），拒绝跨站请求；移除原先过宽的 `Access-Control-Allow-Origin: *`。
  - 代理返回 `/provider`、`/config*` 的 JSON 时，把 `apiKey` / 长 `key` 值脱敏为 `"***"`，避免明文密钥经 HTTP 暴露给本机任意进程。
- 保留需求：本地明文备份 `auth.json.bak` 按约定不处理。
- `index.html` 加 `Cache-Control: no-store`；重启 `server.py` 后请 **Ctrl+F5** 刷新以取得新 token（否则旧页面 403）。
- 回滚备份：`backups/pre-security-<时间戳>/`（server.py / index.html / base-override.ts / CHANGELOG.md）。

## v0.1.24 变更

- **思考块自动滚动**：推理（reasoning）内容流式输出时，思考块内部自动滚到最新一行；用户手动上翻则暂停跟随，翻回底部恢复。便于确认思考仍在推进，避免模型陷入循环而界面毫无感知。
- **生成时不再强制回到底部**：消息区仅在用户位于底部附近时才自动跟随新内容；用户上翻查看时不再被拽回。发送消息 / 切换会话 / 出错提示仍强制回到底部；点「回到底部」按钮恢复跟随。
- 纯前端改动，刷新页面即可。

## v0.1.23 变更

- 凭据迁移（本机操作）：SiliconFlow 由国际站 `siliconflow`（默认 `.com`，此前靠 Base URL 覆盖到 `.cn`）迁移到内置的 **`siliconflow-cn`**（默认即 `https://api.siliconflow.cn/v1`，无需覆盖）；自定义模型列表一并迁移。原加密存储已备份为 `~/.config/opencode-chat/secrets.json.bak-pre-cn`。
- 结论/建议：应优先使用与服务商区域匹配的内置 provider（如 `siliconflow-cn`），而不是把国际站 provider 的 Base URL 指到国内站；站点不匹配会得到 401「Token is invalid」或 403。
- 迁移后需**重启 server.py 与 opencode**：插件在启动时读取加密存储注入 `siliconflow-cn.options.apiKey`。

## v0.1.22 变更

- 新增**服务商自定义模型**：连接弹窗（API Key / Base URL）增加「自定义模型 ID」文本区，每行一个。用于 opencode models.dev 目录里没有、但账号实际可用的模型（聚合站 / 算力站常见，如 SiliconFlow 的 `Pro/moonshotai/Kimi-K2.6`）。
- `server.py`：`/api/_secret` POST 接受 `models`（数组，或前端传来的每行一个），按 `{"key":..., "baseURL":?, "models":?}` 存储；GET 返回 `models` 映射。key 留空可仅更新 Base URL / 模型列表。
- 插件 `base-override.ts`：读取 `models` 并注入 `config.provider[id].models`（缺失项补 `{name:id}`），opencode 启动后即出现在模型下拉。
- 排查结论（SiliconFlow）：`moonshotai/Kimi-K2.6` 等报 403「Model is private」是因为 models.dev 的 ID 与账号不符；账号真实 ID 为 `Pro/moonshotai/Kimi-K2.6`（实测 200，`moonshotai/Kimi-K2.7-Code`、`zai-org/GLM-5.3` 亦可）。已为 siliconflow 预填 `Pro/moonshotai/Kimi-K2.6`。
- 注意：若某 ID 在 models.dev 中已存在但被标记为隐藏 / 非 active，opencode 可能仍不显示；models.dev 没有的账号专属 ID（如 `Pro/...`）可正常显示。

## v0.1.21 变更

- 助手消息出错时界面不再静默：`message.updated` 与历史加载都会读取 `info.error`，在该条消息下方以红色气泡显示「模型调用失败：<名称> [<状态码>] <message>」。此前模型返回错误（如 401/403）只写进 opencode 日志，聊天区一片空白无任何提示。
- 说明：SiliconFlow 部分模型（如 `moonshotai/Kimi-K2.6`、`moonshotai/Kimi-K2.5`、`zai-org/GLM-5`）会返回 `403 {"code":30004,"message":"Model is private. You can not access it"}`，属**账号无权访问**，与前端/代理无关；可用模型以实际返回 200 的为准（如 `deepseek-ai/DeepSeek-V3`、`Qwen/Qwen3-8B`）。

## v0.1.20 变更

- 修复模型 ID 含 `/`（如 SiliconFlow 的 `deepseek-ai/DeepSeek-V3`、`moonshotai/Kimi-K2.6`）时被截断的 bug：顶栏模型下拉与助手设置里的 `<option>` 原以 `providerID + "/" + id` 作值、再用 `split("/")` 解析，多段 ID 只取到第一段，导致 `ProviderModelNotFoundError: Model not found: siliconflow/deepseek-ai`。现改用 `modelKey()` / `parseModelKey()`（JSON 编码 `[providerID, id]`）读写，兼容任意含 `/` 的模型 ID。涉及顶栏下拉、助手设置下拉、`populateVariantSelect` 与 `saveAssistant`。
- 前端改动**刷新页面即可**，无需重启 opencode。

## v0.1.19 变更

- 服务商面板支持**任意服务商手动连接**：每个服务商行都提供「连接」→「手动 API Key（可自定义 Base URL）」，供 opencode 未上报认证方式的服务商（如 deepseek）以及**聚合站 / 算力站**的 OpenAI 兼容端点使用。
- 新增「API Key / Base URL」弹窗（`#provKeyMask`）：Key 为密文输入、用后即清空；Base URL 可选，用于覆盖服务商端点。已连接的服务商可留空 Key **仅更新 / 清除 Base URL**。
- `server.py` `/api/_secret`：POST 现接受 `{provider, key, baseURL?}`，按 `{"key": <DPAPI 密文>, "baseURL": <明文>}` 存储；`key` 留空时沿用既有密文（仅改 Base URL）；GET 响应新增 `baseURL` 映射。仍兼容 v0.1.17 的纯字符串密文格式。
- 插件 `base-override.ts`：`config` 钩子同时兼容字符串与对象两种密文，分别注入 `config.provider[id].options.apiKey` 与 `options.baseURL`。
- 连接任意服务商后仍需**重启 opencode**，由插件在启动时注入生效。

## v0.1.18 变更

- 修复 v0.1.17 加密凭据「写得到、插件读不到」的路径错位问题：Windows Store 版 Python 会把 `%LOCALAPPDATA%` 的读写重定向到包沙箱（`...\Packages\PythonSoftwareFoundation.Python.3.13_*_qbz5n2kfra8p0\LocalCache\Local\...`），而 opencode 插件（Node）读取的是真实 `%LOCALAPPDATA%`，于是密文文件虽已落盘、插件却读不到而不注入密钥（表现为：`_secret` 接口正常、deepseek 仍可用但实际靠 `auth.json` 明文兜底）。现两端统一改用**非重定向路径** `~/.config/opencode-chat/secrets.json`。
- `server.py`：`SECRETS_DIR` 由 `%LOCALAPPDATA%` 改为 `~/.config/opencode-chat`。
- 插件 `base-override.ts`：`readSecrets()` 改为按候选路径读取（首选 `~/.config/opencode-chat/secrets.json`，回退旧 `%LOCALAPPDATA%\opencode-chat\secrets.json`），兼容历史密文。
- 已将现有 deepseek 密文迁移至新路径，并交叉验证可解密、与 `auth.json` 明文一致（35 字符）。
- 重要：在「重启 server.py + opencode 并确认 deepseek 可用」之前，**不要**点「清除明文」，否则 `auth.json` 明文删除后若插件未注入将导致服务商不可用。

## v0.1.17 变更

- 安全修复：不再把服务商 API Key 明文写入 opencode 的 `auth.json`。API Key 连接改为写入**本地 DPAPI 加密存储**（Windows 数据保护 API，当前用户作用域），磁盘上只有密文。
- `server.py` 新增 `GET/POST/DELETE /api/_secret`（经 `CryptProtectData`/`CryptUnprotectData` 加密解密，存于 `%LOCALAPPDATA%\opencode-chat\secrets.json`）与 `POST /api/_secret/purge`（从 `auth.json` 移除指定服务商明文并备份为 `auth.json.bak`）。
- 插件 `base-override.ts` 新增 `config` 钩子：启动时读取本地加密存储，用 PowerShell 调 DPAPI 解密，注入 `config.provider[<id>].options.apiKey`，opencode 在内存中拿到明文密钥、磁盘不落明文。
- 前端服务商面板：API Key 输入框改为密文（`type=password`，用后即清空）；连接走加密存储并自动清除 `auth.json` 明文；`GET /api/_secret` 同时返回 `plain`（`auth.json` 中仍为明文的 provider），面板对这类服务商显示「清除明文」按钮（带确认与 `.bak` 备份），本地加密的服务商标记为「本地加密」并提供「断开」。改动需重启 `server.py` 与 opencode 生效。

## v0.1.16 变更

- 新增「服务商与模型」管理面板（设置 → 服务商与模型 → 管理）：`GET /provider` 列出 opencode 已知的全部服务商（213 个）与 `connected` 连接状态，`GET /provider/auth` 读取各服务商的认证方式。
- 支持连接服务商：API Key 走 `PUT /auth/{id}`（`{type:"api",key}`）；OAuth 走 `POST /provider/{id}/oauth/authorize` → 浏览器授权 → `code` 方式回填授权码 `POST /provider/{id}/oauth/callback`，`auto` 方式轮询 `/provider` 直到 `connected`。连接成功后自动 `loadModels()` 刷新顶栏模型下拉。
- 每个服务商可展开「模型」（懒加载）查看其模型，点击任一模型即把当前助手的默认模型切换到该模型。支持按名称/ID 过滤服务商。
- 全程只调用 opencode 现有 API，**不修改任何配置文件**。

## v0.1.15 变更

- 修复应用图标被裁切的问题（桌面快捷方式「只露出半边」）：此前 `icon-128.png` 为空、`icon-192/256.png` 与 `apple-touch-icon.png` 只有右侧一条，`favicon.ico` 的 128/256 帧同样损坏。现以正确的 `icon-512.png` 为源重新生成全套位图（16/24/32/48/64/128/192/256/512）与 `favicon.ico`（16/24/32/48/64/128/256），并用 rcedit 把同一图标写回 `opencode-chat.exe`。

## v0.1.14 变更

- 修复「纯净输入」导致本助手系统提示词不生效的问题：开启纯净输入时原本会连同本助手的系统提示词一起清空，现改为**只清空 opencode 基底 / 环境**，仍发送本助手系统提示词（`postPrompt` 的 pureInput 分支重新拼入 `a.system`）。界面提示同步更新。
- 新增「非思考」思考挡位：当所选模型声明支持推理（`capabilities.reasoning`）时，顶栏与助手设置的「思考强度」下拉新增「非思考」选项（模型自带 `none` 变体时直接走 `variant`）。选择后发送 `[[OC_PARAMS]]{"reasoning":"none"}`；插件 `chat.params` 对 `@ai-sdk/openai-compatible`（DeepSeek 等）注入 `output.options.thinking = { type: "disabled" }`（DeepSeek OpenAI 格式的思考开关，随 provider 透传进请求体），其它 provider 回退 `output.options.reasoningEffort = "none"`。注意：DeepSeek 的 `reasoning_effort` 只接受 `low/high/max`，关闭思考必须用 `thinking`。

## v0.1.13 变更

- 新增「图片自动压缩」：上传（选择 / 拖拽 / 粘贴）图片时，若长边超过 1024px 自动等比压缩，降低高分辨率图片对模型 token 的消耗；GIF / SVG 及已 ≤1024px 的图片不处理。
- 压缩保持原格式族（JPEG → JPEG、WebP → WebP，其余 → PNG），附件卡显示「已压缩」徽标与压缩后大小；压缩失败自动回退为原图。
- 设置面板新增「图片自动压缩」开关（默认开启，存 `oc_img_compress`），关闭后按原图发送。

## v0.1.12 变更

- 新增「回复用时」计时器：助手回复期间，顶栏显示实时计时（`#genTimer`），正在流式输出的助手消息底部显示「用时 Xs…」实时刷新；回复完成后按消息自身 `time.created` → `time.completed` 定格为最终用时，历史消息加载时也直接显示各自用时。
- 将「我的昵称 / 我的头像」移出设置面板，改为侧栏**左下角的用户栏**（圆形头像 + 昵称 + 编辑图标），点击打开「我的资料」弹窗编辑；资料变更即时刷新用户栏与已渲染消息头部。
- 昵称 / 头像仍为纯本地展示，不写入消息或系统提示词、不发给模型。

## v0.1.11 变更

- 新增用户「我的昵称」「我的头像」（设置面板）：昵称替代消息里的「你」，头像以圆形显示在用户消息头部；头像可上传图片（自动居中裁方、压成 160px webp）或清除，存 `localStorage`（`oc_user_name` / `oc_user_avatar`）。
- 助手支持自定义头像：助手编辑弹窗新增「头像」上传/清除，未上传时回落到原「图标」字符；头像与昵称显示在助手消息头部、会话顶栏与助手树（`a.avatar`，随助手持久化）。
- 以上昵称 / 头像**仅本地视觉展示，不写入消息或系统提示词、不发给模型**。切换助手、编辑助手或修改用户资料时，已渲染消息的头部会即时刷新。

## v0.1.10 变更

- 新增「搜索消息」（顶栏放大镜按钮 / `Ctrl+F`）：在**当前会话**内按关键词搜索历史消息，弹出预览界面以缩略形式展示命中的用户消息与助手正文。
- 支持空格分隔多个关键词（需全部命中）、命中词高亮、`↑`/`↓` 选择结果、`Enter` 或点击快速跳转到对应消息并高亮闪烁。
- 搜索直接基于已渲染的消息 DOM（用户取正文 `__raw`、助手取文本气泡，不含时间戳 / 工具 / 思考），不额外请求接口。

## v0.1.9 变更

- 新增全局「工具超时」设置（设置 → 工具超时，0–600s，默认 60s）：bash 命令运行超过该时间时由 opencode 自动终止，并把超时提示（`shell_metadata`）作为工具结果返回模型，避免因命令卡死长时间无响应。
- 前端把超时编码进 `[[OC_PARAMS]]` 的 `bashTimeout` 字段（毫秒）随每条消息下发；插件 `base-override.ts` 在 `chat.params` 里按会话记录，并新增 `tool.execute.before` 钩子：仅当模型未显式传 `timeout` 时注入该默认值，模型显式指定的超时最多放宽到 600s。对不带该标记的其它 opencode 用法不产生任何影响。
- 设置范围为 0–600s，设为 0 即关闭（回落到 opencode 默认 120s）。注意插件为配置期加载，修改后需重启 opencode；前端改动刷新页面即可。

## v0.1.8 变更

- 应用图标最终定为「五层渐变 · 回字形层叠」：5 片等距菱形薄片自下而上渐变（`#0e8262` → `#16e0b0`），每层中间挖洞（回字形方片），顶层孔洞内用深色背衬做出内凹立体感，下方各层因遮挡自然收敛。
- 用 `icon.svg`（矢量）重新渲染并覆盖全套位图：`favicon-16/32.png`、`icon-48/64/128/192/256/512.png`、`apple-touch-icon.png`，合成多尺寸 `favicon.ico`（16/32/48/64/128/256），并用 rcedit 写回 `opencode-chat.exe` 图标。
- 修复「打开 HTML 预览后无法退出」：应用以 Edge `--app` 模式运行、无地址栏/后退键，故预览页打开后回不去。现由 `server.py` 在静态托管时对所有非 `index.html` 的 `.html` 注入左下角「← 返回应用」浮层与 Esc 返回快捷键；`index.html` 本身不注入。

## v0.1.7 变更

- 更换应用图标：由像素风对话气泡改为等距立体图标（先做等距方块 O，最终在 v0.1.8 定为五层渐变回字形层叠）。

## v0.1.6 变更

- 助手设置新增「温度 temperature」与「topP」两个高级采样参数输入框：留空即使用模型默认值，随助手持久化（`a.temperature` / `a.topP`）。
- 附带醒目警告条：提示这是高级参数、非必要请勿修改，范围校验为温度 `0~2`、topP `0~1`，超范围或非数字会拦截保存。
- 通过 `system` 末尾附加 `[[OC_PARAMS]]{...}` 标记下发参数；opencode 插件 `base-override.ts` 新增 `chat.params` 钩子解析该标记并设置 `temperature` / `topP`，同时在 `system.transform` 中把标记从发给模型的提示词里彻底剥离。
- 模型能力 `capabilities.temperature === false` 时（如部分推理模型）自动忽略温度 / topP，避免报错。

## v0.1.5 变更

- 新增「思考强度」选择（reasoning effort）：读取模型自带的 `variants`，顶栏在模型选择器右侧出现强度下拉（`默认 / low / high / max / minimal / medium / xhigh` 等，按模型实际支持项显示）；不支持 `variants` 的模型自动隐藏该控件。
- 助手编辑弹窗新增「思考强度」下拉，仅在该助手所选模型支持时可选，随助手持久化（`a.variant`）；顶栏切换模型时，若新模型不支持原强度会自动回退为「默认」。
- 发送时通过 `prompt_async` 顶层 `variant` 字段下发（非 `model.variant`），仅当所选模型确实包含该 `variant` 时才发送。
- `server.py` 的 `/api/_models` 现在同时返回每个模型的 `capabilities` 与 `variants`（变体名列表）。

## v0.1.4 变更

- 侧栏新增「收藏」入口（星形按钮），弹窗分「收藏的助手 / 收藏的对话 / 收藏的消息」三栏展示。
- 助手收藏：助手行悬浮出星标，可收藏/取消；收藏的助手在本组内置顶并显示实心星，删除时二次确认防误删（`a.favorite`）。
- 对话收藏：会话行悬浮出星标，可收藏/取消；收藏记录助手、目录、标题与时间，可从收藏夹一键跳回原会话（`S.favorites` kind=`session`）。
- 消息收藏与编辑：每条消息操作区新增「收藏」，保存角色 + 正文快照；收藏夹内可「查看」（跳回原消息并高亮闪烁）、「编辑」（多行编辑器改文本）、「删除」；对话收藏可编辑标题（kind=`message`）。
- 收藏数据存于 `localStorage`（`oc_workspace_v2` 的 `favorites` 字段），原会话/助手被删后收藏仍保留（跳转会提示失效）。
- 「纯净输入」的时间戳改为渲染时从正文剥离，单独显示为气泡下方的小号灰字（`.msg-stamp`），不再混在气泡正文里造成误解；复制 / 收藏也只取正文，不含时间戳。

## v0.1.3 变更

- 助手级「纯净输入」开关：开启后，发送给模型的只有消息正文 + 发送时间戳（`[发送时间：YYYY-MM-DD HH:MM:SS]`），并复用 `[[OC_BASE_OVERRIDE]]` 标记清空 opencode 基底 / 环境 / 系统提醒及本助手系统提示词；仅对开启该开关的助手生效，其它助手与其它基于 opencode 的用法不受影响。重新生成时会先去掉旧时间戳再追加新时间戳，避免重复。

## v0.1.2 变更

- 支持 `question` 工具（反问用户）：监听 `question.asked` 事件，在对话内渲染可交互问题卡（单选 / 多选 / 自定义输入），可「提交」或「跳过」。
- 提问回答走 `POST /question/<id>/reply`（`{ answers: [[label...], ...] }`）与 `POST /question/<id>/reject`；回答后卡片回显已选项，不再退化为原始 JSON。
- 支持 LaTeX 公式：加载 KaTeX，识别 `$...$` / `$$...$$` / `\(...\)` / `\[...\]`；解析 Markdown 前先保护公式与代码段，避免 `_`、`*` 被 Markdown 误吞，代码块内的 `$` 不会被当作公式。
- Token 计数：每条助手消息底部显示 `Σ/输入/输出/思考/缓存` 与费用，顶栏显示本会话累计；设置中可开关显示。
- 设置页新增「用量统计」：汇总全部助手工作区的输入/输出/思考/缓存/费用与会话数，并列出历史会话用量，点击可跳转该会话。
- 助手级「Git 安全」开关：开启后，每条消息会附带 `GIT_SAFE_RULE` 系统提示，要求 agent 在执行 `git add/commit/push` 前先列出 `git status/diff`、检查密钥/凭证/大文件等敏感内容并等待用户确认；助手树中显示 `Git` 徽标。
- 图片查看：点击消息内图片、代码工具产出的图片、输入框附件缩略图，打开全屏查看器；支持滚轮/按钮缩放（以指针为中心）、拖拽平移、双击在 1×/2.5× 切换、`+/-/0` 快捷键、Esc 或点空白关闭、新标签打开原图。工具结果里的 `attachments` 图片也会一并渲染。
- 外观自定义：设置中可调**字体大小**（12–22px，`--fs` 变量驱动正文/代码/输入框）与**助手文本居中**开关（`body.ast-center`，气泡与文本居中、代码块保持左对齐）；均存 `localStorage`（`oc_font_size` / `oc_ast_center`）。
- 应用图标换成极简像素风格对话气泡（主色 `#10a37f`）：新增 `static/icon.svg`、`favicon.ico`、`favicon-16/32.png`、`icon-48/64/128/192/256/512.png`、`apple-touch-icon.png`、`manifest.webmanifest`；`index.html` 加 favicon / manifest 链接；`server.py` 补充 `.ico/.json/.webmanifest` MIME；`opencode-chat.exe` 用 rcedit 写入同一图标与版本信息。

## 运行方式

```
# 1) opencode 本体（默认 4096）
opencode web --port 4096

# 2) 本地代理 + 静态服务（默认 8000）
python server.py

# 3) 浏览器打开
http://127.0.0.1:8000
```

代理环境变量：`OPENCODE_HOST` / `OPENCODE_PORT`（上游，默认 127.0.0.1:4096）、`FRONT_PORT`（默认 8000）、`OC_PROXY_DRYRUN`（=1 时白名单仅记录不拦截）、`OC_LOG_FILE`（可选，请求日志追加写入的路径）。

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `server.py` | 本地代理：`/api/*` 转发到 opencode；静态托管 `static/`（含 `.ico/.svg/.png/.webmanifest` MIME）；`/api/_models` 模型列表；`/api/_mkdir` 创建目录；给非 `index.html` 的 `.html` 注入「返回应用」浮层 |
| `static/index.html` | 前端 HTML 骨架（外部引入 `/css/app.css` 与 `/js/*.js`），连接代理 |
| `static/css/app.css` | 全部样式（由原单文件 `<style>` 拆出） |
| `static/vendor/` | 本地前端依赖：`purify.min.js`（DOMPurify 3.1.6，Markdown HTML 净化）、`marked.min.js`、`highlight.min.js` + `highlight-github-dark.min.css`、`katex.min.js` + `katex.min.css` + `fonts/*.woff2`（v0.1.43 起全部本地化，无 CDN） |
| `static/js/*.js` | 全部前端脚本（15 个经典脚本，按 `core`→…→`boot` 顺序加载；含 `proxy.js` 对话托管） |
| `static/icon.svg` / `favicon.ico` / `favicon-16|32.png` / `icon-48/64/128/192/256/512.png` / `apple-touch-icon.png` / `manifest.webmanifest` | 五层渐变回字形层叠应用图标（`#0e8262`→`#16e0b0`）与 PWA 清单 |
| `opencode-chat.exe` | .NET 启动器：检测 8000 端口，必要时 `python server.py`，再用 Edge `--app` 打开页面 |
| `~/.config/opencode/plugin/base-override.ts` | 按请求标记"顶掉 opencode 基底提示词"；解析 `[[OC_PARAMS]]` 标记覆盖 `temperature` / `topP`；`tool.execute.before` 按会话给 bash 注入默认超时（`bashTimeout`） |
| `~/.config/opencode/opencode.jsonc` | 注册上述插件 |

## 功能清单

### 会话与对话
- 会话增删改查、按助手工作区隔离
- 模型 / Agent 选择，Markdown 渲染、代码高亮、LaTeX 公式（KaTeX）、思考过程展示
- 思考强度选择（`variant`）：对带 `variants` 的思考模型（如 `low/high/max`）可在顶栏或助手设置中选择，不支持的模型自动隐藏；支持推理的模型额外提供「非思考」挡位
- SSE 实时流式输出，按会话过滤；停止生成
- 权限确认弹窗（允许一次 / 总是允许 / 拒绝）
- 复制消息、重新生成（保留图片与文件附件）
- 消息收藏（保存正文快照，可在收藏夹查看/编辑）
- 消息搜索：当前会话内关键词检索，缩略预览 + 快速跳转高亮（顶栏放大镜 / `Ctrl+F`）
- 回复用时计时器：回复中顶栏与消息底部实时计时，完成后显示最终用时
- 回到底部悬浮按钮

### 对话托管
- 指定助手代替「用户」生成下一条发言，作为你的消息发回当前会话
- 手动「托管一步」或「自动托管 N 轮」（N ≤ 20，运行中可停止）
- 托管模型有推理内容时，聊天区贴出可收起的「托管思考」块
- 运行中输入栏流光 + 呼吸动效，与普通发送区分
- 生成走临时会话，不污染当前对话；托管助手全局记忆

### 助手系统
- 助手 / 文件夹树，支持新建、编辑、删除、归类
- 复制助手：一键复制配置（不含对话），副本自动命名 `（1）` 并新建独立工作区
- 每个助手独立工作区目录
- 新建助手默认自动创建 `%USERPROFILE%\opencode-workspaces\<助手名>` 文件夹（名称清洗、重名加 `-2`）
- 应用内目录浏览器，也可手动指定工作区
- 助手级「Git 安全」开关：commit/push 前先检查敏感内容并等确认，树中显示 `Git` 徽标
- 助手收藏：星标置顶，删除收藏中的助手需二次确认

### 服务商与模型
- 列出全部服务商与连接状态，支持 API Key / OAuth 连接，连接后模型自动出现在模型选择
- 展开查看各服务商模型（懒加载），点击即可切换当前助手模型
- 仅调用 opencode API，不写配置文件

### 附件
- 回形针选择、拖拽、粘贴上传图片 / 文件（上限 20 MB）
- 图片自动压缩：长边超过 1024px 时等比压缩，降低图片 token；GIF / SVG 跳过，可在设置关闭
- 附件缩略图预览、可单个移除
- 依据模型 `capabilities` 校验：不支持图片 / PDF / 音频 / 视频时给出提示并拦截
- 文本 / 代码类文件始终放行（opencode 以内联方式处理）

### 工具使用体验
- 工具摘要栏：名称 + 关键参数 + 耗时 + 状态
- `bash` 终端样式（命令、输出、exit code）
- `edit` 解析 diff，新增/删除高亮与统计
- `read` 目录列表 / 文件内容
- `write` 新建/覆盖标识与内容预览
- `todowrite` 待办列表；运行中/出错自动展开
- `question` 交互卡：单选 / 多选 / 自定义输入，可提交或跳过，回答后回显
- 工具产出的图片（`state.attachments`）自动渲染，可点击放大
- 工具超时：bash 命令超过设定时间（设置 → 工具超时，默认 60s，0 = 关闭）自动终止，超时信息作为工具结果返回模型

### 用量与统计
- 每条助手消息显示 Token（`Σ/输入/输出/思考/缓存读/写`）与费用
- 顶栏显示本会话累计；设置中可开关显示（`oc_show_tokens`）
- 设置页「用量统计」：汇总全部工作区并列出历史会话，点击跳转

### 图片查看
- 点击消息图片 / 工具图片 / 附件缩略图打开全屏查看器
- 滚轮与按钮缩放（以指针为中心）、拖拽平移、双击 1×/2.5×、`+/-/0`、Esc 关闭、新标签打开

### 提示词与工具开关（按助手）
- 「顶掉 opencode 基底提示词」开关：开启后仅发送助手自己的系统提示词，去掉编程基底（RP / 非编程用）
- 「工具」勾选列表：默认全开，可逐个关闭或全开/全关；发送时仅把关闭项作为 `tools: {id:false}` 下发
- 「Git 安全」开关：向系统提示追加 Git 提交前检查规则
- 「纯净输入」开关：只发送正文 + 发送时间戳，清空 opencode 基底（保留本助手系统提示词）
- 「温度 temperature」/「topP」：高级采样参数，留空用默认，带范围校验与风险警告；由插件 `chat.params` 按请求覆盖

### 外观
- 明暗主题、背景图片与遮罩
- 字体大小（12–22px）与「助手文本居中」开关
- 用户昵称 / 头像（侧栏左下角用户栏）与助手昵称 / 头像（本地展示，不发给模型）
- 五层渐变回字形层叠应用图标（favicon / manifest / exe）
- 自定义滚动条（聊天区悬停才显现）

## 关键实现要点

- **目录传递**：opencode 的 `directory` 通过 URL 查询参数传递（`?directory=<encodeURIComponent>`），避免中文路径放进 HTTP 头导致 `fetch` 报错。
- **事件流按目录隔离**：`/api/event?directory=...`，切换助手时重连；否则新建工作区收不到实时事件。
- **模型字段**：`prompt_async` 的 `model` 必须是 `{ providerID, modelID }`（不是 `id`）。
- **思考强度**：模型信息里的 `variants` 是对象，取 `Object.keys` 作为可选强度；`prompt_async` 的强度字段是**顶层** `variant`（`model` 只接受 `providerID/modelID`，多余的 `variant` 会因 `additionalProperties:false` 报错）。只有当前模型 `variants` 包含所选值时，`postPrompt` 才下发 `body.variant`。
- **温度 / topP**：`prompt_async` 不接受 `temperature` / `topP`，故前端把它们编码为 `[[OC_PARAMS]]{"temperature":..,"topP":..}` 追加到 `body.system`；插件 `chat.params` 钩子从 `input.message.system` 解析后设置 `output.temperature` / `output.topP`（模型 `capabilities.temperature === false` 时不设置），`experimental.chat.system.transform` 再把该标记从 system 中删除，模型看不到标记。
- **工具超时（bash）**：前端把全局「工具超时」以 `bashTimeout`（毫秒）合入 `[[OC_PARAMS]]`；插件 `chat.params` 按 `sessionID` 存表，`tool.execute.before` 在该会话的 `bash` 调用上：模型未传 `timeout` 时写入该默认值，已传则上限收紧到 600s（`output.args` 需**原地改属性**，重新赋值不生效）。opencode 超时会 `kill` 进程并在工具输出末尾追加 `<shell_metadata>shell tool terminated command after exceeding timeout …</shell_metadata>`，即以工具结果形式返回模型。
- **重新生成**：删除助手消息 + 其前一条用户消息，再按原输入重发；只保留 `file` 部件与 `non-synthetic` 文本，跳过 opencode 自动生成的 synthetic 文本。
- **收藏**：数据存于 `S.favorites`（随 `oc_workspace_v2` 持久化）；助手收藏用 `a.favorite`。消息收藏保存 `role` + `text` 快照，跳转时设 `pendingScrollMessageId`，`selectSession` 渲染后 `scrollIntoView` 并加 `fav-flash` 高亮；对话/消息收藏均按引用保存 id，原对象删除后仅提示失效。
- **消息搜索**：`collectSearchItems` 遍历 `messagesEl` 下的 `.msg[data-id]`，用 `messageRawText` 取用户正文（`__raw`，已剥离时间戳）与助手文本气泡；`runSearch` 按空格拆词做 AND 匹配，`searchSnippet` 截取首个命中前后上下文、转义后高亮（`mark`）；`jumpToSearchResult` 对已渲染消息直接 `scrollIntoView` + `search-flash`。纯前端、不请求接口。
- **服务商/模型管理**：`GET /provider` 返回 `{all, default, connected}`，`GET /provider/auth` 返回 `{providerID: [{type,label}]}`。API Key 连接写入本地加密存储（见下），不再用 `PUT /auth`；OAuth 用 `POST /provider/{id}/oauth/authorize` body `{method:index}` 得到 `{url,method:"auto"|"code",instructions}`，`code` 模式回填 `POST /provider/{id}/oauth/callback` body `{method,code}`，`auto` 模式轮询 `/provider` 直到进入 `connected`。连接后 `loadModels()` 刷新 `/config/providers` 驱动的模型下拉。模型 chips 懒加载（213 个服务商逐个展开才建 DOM）。
- **凭据加密存储**：`server.py` 用 ctypes 调 `crypt32.CryptProtectData`/`CryptUnprotectData`（当前用户作用域 DPAPI），密文存 `~/.config/opencode-chat/secrets.json`；插件 `config` 钩子在 opencode 启动时读取该文件、spawn PowerShell（`Add-Type -AssemblyName System.Security`）解密，注入 `config.provider[id].options.apiKey`。用户在 UI 输入的 key 经 `POST /api/_secret` 加密落盘，`POST /api/_secret/purge` 从 `auth.json` 删除明文（备份 `.bak`）。两端 DPAPI 已交叉验证可互通。**注意**：密文路径刻意不用 `%LOCALAPPDATA%` —— Store 版 Python 会把该路径重定向到包沙箱，导致 Node 侧插件读不到；`~/.config`（`USERPROFILE` 下）不被重定向，两端一致。插件侧按候选路径读取，优先新路径、回退旧 `%LOCALAPPDATA%` 路径。存储值兼容两种格式：旧版为纯字符串（仅 Key 密文），新版为 `{"key": <DPAPI 密文>, "baseURL": <明文可选>}`；插件读取后注入 `options.apiKey` 与 `options.baseURL`，用于聚合站 / 算力站等自定义端点。
- **顶掉基底**：插件监听 `experimental.chat.system.transform`，仅当请求 `system` 含标记 `[[OC_BASE_OVERRIDE]]` 时把整个 system 替换为标记之后的内容；无标记的请求完全不碰，不影响其它 opencode 用法。
  - 注意：必须**原地修改** `output.system`（`sys.length = 0; sys.push(...)`）。opencode 调用钩子后仍持有原数组引用，直接给 `output.system` 重新赋值不会生效。
- **工具过滤语义**：opencode 为 `user.tools?.[id] !== false`，即不传或 `true` 均视为开启，只有显式 `false` 才关闭。
- **LaTeX**：`renderMarkdown` 先抽取代码段（```/` `）与公式（`$...$`/`$$...$$`/`\(...\)`/`\[...\]`）为占位符，再交给 marked，最后用 KaTeX 还原；避免 marked 把 `_`/`*` 当强调，且代码里的 `$` 不会被当公式。
- **question**：`question.asked` 事件含 `tool.callID`，据此定位对话内对应工具块并渲染交互卡；回答 `POST /question/<id>/reply`、跳过 `POST /question/<id>/reject`；刷新后用 `GET /question` 补拉未答问题。
- **Token 统计**：数据来自 `message.info.tokens` / `cost` 与 `session.tokens` / `cost`；本会话累计为当前已渲染助手消息求和，避免与列表缓存不一致。
- **Git 安全**：`postPrompt` 组装 system 时先拼助手 `system`，再拼 `GIT_SAFE_RULE`，`overrideBase` 开启时在最前加 `[[OC_BASE_OVERRIDE]]` 标记。属提示词级约束（非硬拦截）。
- **纯净输入**：`postPrompt` 中若 `pureInput`，则只把正文文本部件尾部追加 `[发送时间：...]` 后发送，并把 `body.system` 设为 `[[OC_BASE_OVERRIDE]]` + 本助手系统提示词 + 标记，使插件清空 opencode 全部基底但保留本助手提示词；`stampParts` 会先剥掉旧时间戳再追加，保证重新生成不叠加。
- **非思考挡位**：前端把「非思考」编码为 `[[OC_PARAMS]]{"reasoning":"none"}`（模型自带 `none` 变体时则直接走 `body.variant`）；插件 `chat.params` 解析后，按 `input.model.api.npm`（并回退 providerID 含 `deepseek`）写入 `output.options`：`@ai-sdk/openai-compatible` 用 `thinking:{type:"disabled"}`（DeepSeek OpenAI 格式），其它 provider 用 `reasoningEffort:"none"`。该 `options` 即 opencode 合并后的模型 provider options，openai-compatible provider 会把不在其 schema 内的键透传进请求体，故 `thinking` 能到达 DeepSeek。`updateVariantSelect` / `populateVariantSelect` 在 `capabilities.reasoning` 为真时追加该选项并去重。
- **时间戳显示**：用户消息渲染时用 `splitSendStamp` 按 `PURE_STAMP_RE` 把尾部时间戳从正文剥离，正文照常 Markdown，时间戳另建 `.msg-stamp` 小灰字节点（`applyUserStamp`）；`renderMessage` 与 SSE `message.part.updated` 两条路径统一处理，`bubble.__raw` 只存正文，复制 / 收藏自然不含时间戳。
- **昵称 / 头像**：用户资料存 `localStorage`（`oc_user_name` / `oc_user_avatar`），助手存 `a.avatar`（图片 data URL，回落 `a.icon` 字符）。`fillRole` 在每条消息头部渲染圆形头像 + 昵称（用户右对齐、助手左对齐），`refreshMessageRoles` 在资料/助手变更后刷新已渲染消息；用户资料入口为侧栏左下角 `.user-bar`（点击开「我的资料」弹窗）。头像上传走 `pickImageDataUrl`（居中裁方 → 160px webp）。全程仅操作 DOM，不进入消息或 system，故不影响模型与缓存。
- **回复用时**：助手消息 `info.time.created` 为开始、`info.time.completed` 为结束。`updateDuration` 给每条助手消息挂 `.msg-duration`，未完时启动 `durationTimer`（100ms）由 `tickDurations` 同时刷新消息底部与顶栏 `#genTimer`，完成或 `setBusy(false)`（`finalizeDurations`）时定格；多个并发时取最早的活动开始时间。历史会话因消息自带 `time.completed`，加载即显示最终用时。
- **图片自动压缩**：`addFiles` 对图片（排除 GIF/SVG）走 `compressImage`：`<img>` 解码 → 长边 >`IMG_MAX_SIDE`(1024) 时等比绘到 canvas → 保持原格式族编码（JPEG 0.85 / WebP / PNG），返回新 dataURL 与 mime；失败或无需要则回退 `fileToDataUrl` 原图。附件项加 `compressed` 标记与「已压缩」徽标；开关 `oc_img_compress` 默认开。
- **自动滚动**：消息区用 `autoScroll` 标志——仅当滚动位置在底部附近（`nearBottom()`，阈值 80px）时才 `scrollBottom()` 跟随；用户上翻即置 false，点「回到底部」或发送消息时恢复。思考块各自维护 `__stick`（阈值 40px）实现块内自动跟随，用户上翻同样暂停。
- **图片裁剪**：`cropImageFile(file,{aspect,outSize,mime,ratios})` 打开 `#cropMask`；canvas 以「cover」基准缩放 `base` + 缩放 `z`(1–4) 与偏移 `ox/oy` 绘制（拖拽平移、滚轮/滑杆缩放、比例按钮重置），`cropExport()` 由 frame 反算源区域并输出（头像 1:1/≤256，聊天 ≤1024）。聊天图片默认先裁剪，设置 `oc_img_crop=0` 时跳过。
- **草稿**：`oc_drafts`（`{sessionId: text}`）按会话保存输入框内容；`saveDraft/loadDraft/dropDraft`，输入 300ms 防抖、切换会话/助手前落盘、发送与删除会话时清除；在 `selectSession` 载入草稿。
- **版本回滚**：工作区 `rollback.bat` 以时间戳快照 4 个关键文件；`backup` 建快照、无参/`rollback` 回滚到最新快照（回滚前先生成 `pre-rollback-*` 安全快照）、`list` 列出、`<名称>` 指定回滚。批处理须 CRLF 行尾，回滚前用 `dir /b /ad /o-d` 取最新快照并排除 `pre-rollback-*`。
- **编辑消息 / 版本快照**：编辑用户消息 = 从该消息到末尾**倒序逐条** `DELETE /session/{id}/message/{messageID}` 后 `prompt_async` 重发；回复版本存 `oc_replies`（`turnKey = sessionId + "|" + djb2(用户正文)`），`setupVersionNav` 在助手消息底部加 `◀ 版本 n/N ▶`，历史版以 `.bubble.ver-old` + `.show-ver-old` CSS 覆盖显示，`messageRawText` 对 `show-ver-old` 只读旧版气泡。`session.idle` 时 `setupAllVersionNavs()` 刷新。

- **对话托管**：入口为输入栏 `#proxyBtn` 与弹层 `#proxyPop`（选择托管助手存 `oc_rp_proxy`）。`runProxyStep` 读当前会话最近 40 条文本转录，在同目录 `POST /session` 建临时会话，`prompt_async` 携带托管助手 `model`/`agent`/`variant`、禁用全部工具（`tools:{id:false}`）、system = `[[OC_BASE_OVERRIDE]]` + 托管助手系统 + 托管指令 + `[[OC_PARAMS]]`，轮询 `GET /session/{temp}/message` 取 `time.completed` 的助手文本，随后 `DELETE /session/{temp}`，再用 `postPrompt` 把文本作为用户消息发回主会话。轮询时同步读取助手消息的 `reasoning` 部件，经 `setHostingNote` 实时渲染为聊天区底部的「托管思考」块（`#hostingNote`，无推理不显示，切换会话/助手或下次托管时 `clearHostingNote`）。`updateProxyUI` 在运行时给 `.input-wrap` 加 `.hosting` 类，驱动顶部流光线（`hostingSweep`）与呼吸（`hostingPulse`）。自动模式由 `session.idle` 触发 `maybeAutoProxyNext` 续轮，`rpProxyRemaining` 计剩余轮数；切换助手/会话或手动发送/编辑/重生成即停止。

## 已修复问题

1. 发送消息无反应 —— 模型字段名错误（`id` → `modelID`），且错误被静默吞掉；现已在界面提示错误。
2. 中文工作区加载会话报错 `non ISO-8859-1 code point` —— 改用查询参数传目录。
3. 新建助手的输入 / 回复不实时显示 —— 事件流按目录重连。
4. 重新生成丢失上传的图片 / 文件 —— 重建并保留附件部件。
5. `updateTool` 参数名 `el` 遮蔽全局 `el()` 助手函数 —— 重命名修复。
6. 「顶掉基底」插件重新赋值 `output.system` 而非原地修改，实际不生效 —— 改为原地 mutate（v0.1.1）。
7. 内容过高时整页滚动、输入框被顶走 —— flex 子项缺少 `min-height:0`，`.main` 撑破 `100vh`；补 `min-height:0` 并给 `html,body` 加 `overflow:hidden`（v0.1.2）。
8. 超长不换行内容撑出横向滚动条 —— 助手居中时 `align-items:center` 让 flex 子项按 max-content 撑宽；改为只居中文本 + `margin:auto`，并对 `.msg > *` 加 `min-width:0;max-width:100%`、`.messages` 加 `overflow-x:hidden`（v0.1.2）。
9. 加密凭据「服务器写得到、插件读不到」 —— Store 版 Python 重定向 `%LOCALAPPDATA%` 到包沙箱，Node 插件读真实路径，两者错位；改用不被重定向的 `~/.config/opencode-chat/secrets.json` 并让插件按候选路径读取（v0.1.18）。
10. 多段模型 ID 被截断 —— 模型下拉以 `providerID + "/" + id` 作值并用 `split("/")` 解析，含 `/` 的 ID（SiliconFlow / 聚合站常见）只取到第一段，报 `Model not found`；改用 JSON 编码的 `modelKey` / `parseModelKey`（v0.1.20）。
11. 模型报错静默 —— 助手消息的 `info.error` 未渲染，请求 401/403 时聊天区无任何反馈；现以红色错误气泡显示（v0.1.21）。
12. 账号专属模型选不到 —— opencode 的模型来自 models.dev，与聚合站/账号实际模型不一致（SiliconFlow `moonshotai/Kimi-K2.6` 报 403，账号真实 ID 为 `Pro/moonshotai/Kimi-K2.6`）；新增每服务商「自定义模型 ID」并注入 `config.provider[id].models`（v0.1.22）。

13. Markdown XSS（可升级为 RCE）—— `renderMarkdown` 把 marked 输出直接写入 `innerHTML` 未净化，恶意 HTML（如 `<img onerror>`）可窃取页内 `window.__OC_TOKEN` 进而调用 opencode API；现引入本地 DOMPurify 净化、缺失则回退纯文本（v0.1.40）。
14. 托管临时会话残留 —— 生成中断/关页后临时会话留在助手工作区，出现在会话列表与用量统计；现改建于专用目录并在启动时清空（v0.1.40）。
15. 静态路径前缀绕过 —— `server.py` 以 `startswith(STATIC_DIR)` 判断，存在同级 `static*` 目录时可越权读取；现改为分隔符 + 大小写归一比较（v0.1.40）。
16. 托管期间编辑/重生成竞争 —— 托管生成时 `busy` 仍为假，`regenerate`/`editUserMessage` 未守卫，可能删除消息与托管结果竞争；现加 `rpProxyRunning` 守卫（v0.1.40）。

## 注意事项

- `base-override.ts` 插件为**配置期加载**，新增或修改后需**重启 opencode** 才生效；工具开关、前端改动刷新页面即可。
- 插件装在全局 `~/.config/opencode/`，但对所有 opencode 会话都只在该标记存在时才动作，其它用法不受影响。
- 顶掉基底只影响 system 提示词；工具 schema 由工具开关单独控制，两者可组合出"干净 RP 会话"。
- **连接/修改服务商后必须重启 opencode**：插件只在启动时读取加密存储并注入，否则该服务商不会出现在模型下拉里（表现为 `ProviderModelNotFoundError: Model not found`）。
- **区域端点**：部分服务商国内外域名不同（如 SiliconFlow 国际站 `https://api.siliconflow.com/v1`、中国站 `https://api.siliconflow.cn/v1`）。key 只对对应站点有效。优先改用**区域内置 provider**（如 `siliconflow-cn`）；若该服务商没有区域变体，再用「手动 API Key（可自定义 Base URL）」填正确 Base URL。
