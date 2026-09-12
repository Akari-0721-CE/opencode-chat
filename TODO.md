# 待办 / Backlog

> 计划索引：
> - 体验优化（当前阶段）：`TODO-UX.md`
> - 发布优化（准备发布时启动）：`TODO-RELEASE.md`

## 交接摘要（换上下文前）
- **当前版本**：`v0.2.0`（首个对外发布候选，功能等同 0.1.79）；最新快照 `backups/v0.2.0-20260912-195113`；`VERSION`=0.2.0 与 `CHANGELOG.md` 顶部一致；发布包 `dist/opencode-chat-0.2.0.zip`（11.0MB，审计 101 项通过）。
- **首次下载进度提示（v0.1.79）**：启动器把 `preparing/downloading/verifying/extracting/installing-npm/ready/error` 写入 `~/.config/opencode-chat/opencode-install.json`（每 512KB，含已下载/总大小）；`server.py` 加 `GET /api/_opencode/status`（令牌保护）；前端 `#ocBootHint` 顶部常驻进度条（`providers.js` `startBootWatch`/`pollOpencodeStatus`，`boot.js` 启动），就绪后自动隐藏并重载模型。
- **连接服务商后模型不显示（v0.1.78，已修）**：API Key 存 DPAPI `secrets.json`，由插件在 **opencode 启动时**注入；保存后不重启 opencode 就看不到模型，刷新无效，且启动器会复用旧 opencode。新增 `server.py` `POST /api/_opencode/restart`（结束 4096 上确认为 `opencode` 的进程并重启，使插件重读 secrets）；前端保存 Key 后**自动重启**并重载模型；服务商弹窗右上角加「重启 opencode」按钮。OAuth 一般无需重启。**注意重启会中断进行中的生成。**
- **端口占用稳健性（v0.1.77）**：前端端口被**非本程序**占用时自动改用下一个空闲端口（8000→8001…，最多 20），不再盲目打开对方端口（否则可能显示 404）；`/_version` 不可用时用 `netstat -ano` 定位 PID，再按进程映像路径（`_proc_image`+`_under`）判断是否本程序旧进程，是则结束升级；前端确未就绪则不打开窗口、改为弹窗+日志。**本机 8000 长期跑旧 `server.py`（无 `/_version`，返回 403）正是旧逻辑盲区。**
- **无 Node 获取 opencode（v0.1.76）**：首次运行若无 opencode，启动器直接从 npm 源下载平台二进制 `opencode-windows-x64`/`arm64`（官方优先→npmmirror 回退，校验 `shasum` SHA-1），解压出 `opencode.exe` 到 `runtime\opencode\`（写 `VERSION`）。检测顺序 runtime→全局→PATH，已有则复用不下载；失败回退 npm（若有 Node）。**本机 `github.com` 不可达而 npm 源可达**，故走 npm 源而非 GitHub Release。已实测：下载 171.5MB、校验通过、`opencode --version`=1.18.30。
- **版本管理（v0.2.0）**：定 `0.2.0` 为发布候选。`rollback.bat` 快照已扩展至 `release/`（launcher/build/uninstall）与根 `README.md`；`VERSION` / `CHANGELOG.md` / 快照 / exe 盖章统一由发版流程维护。**根 `TODO*.md` 仍不在快照内**（有意：避免回滚覆盖交接笔记）。
- **卸载 / 升级（v0.1.75）**：产物根目录 `uninstall.bat`+`uninstall.ps1`（源在 `release/`）；交互确认删程序目录 / 可选删 `~/.config/opencode-chat`，**不卸载系统全局 opencode/Node**，插件不删并提示路径。`launcher.py` 启动时若端口被本程序旧进程占用则结束升级；组件/插件一致时不重复安装（`_copy_if_changed`）；v0.1.75 起 `rollback.bat` 已纳入 `release/`。
- **多语言（v0.1.73/0.1.74）**：`js/i18n.js`（中文为 key，`t()` 查英文回退、`tf()` 带参整句；`translateDom()` 精确匹配文本/属性；`MutationObserver` 自动翻译动态 chrome，**跳过用户内容与代码块**并防自触发循环）。设置与首启向导可切换中文/English，默认按系统语言；存 `oc_lang`。英文词表已覆盖各模块动态文案（会话/回收站/消息/用量/服务商/助手/OCR/翻译/托管/附件/备份/权限/搜索/收藏），拼接串用 `tf`，会话时间/分组在渲染层 `t()`。**残留**：少数超长拼接句与跟随语气的中文系统提示词（OCR/翻译/托管 prompt）仍为中文，可按需增补。
- **维护角色**：负责维护本软件本体。**已启用 git**（分支 `master`，无 remote、不 push）；版本以 `VERSION` + `CHANGELOG.md` + tag 管理；不改无关文件。
- **当前运行态**：`server.py` 在 v0.1.78 变更（新增 `/_opencode/restart`），**需重启前端一次**；更早 v0.1.70/0.1.71 也改过。纯前端改动 **Ctrl+F5** 即生效。插件改动才需重启 opencode（服务商弹窗已内置重启按钮）。
- **发布工程（v0.1.71+）**：便携 ZIP + 内置便携 Python。源码 `release/launcher.cs`、`release/launcher.py`、`release/build.ps1`；产物 `dist/`（gitignore）。打包：`powershell -File release\build.ps1`（含**安全审计**：产物不得含本机用户名/绝对路径/敏感文件，不通过即中止）。详见 `TODO-RELEASE.md`（决策已定：内置 Python / 首启自动装 opencode / 便携 ZIP / 新启动器 / 插件走 `plugins/` 自动加载；R5 首启向导与内置默认助手已完成）。
- **验证（发版前必跑）**：改 JS 先 `node --check static\js\*.js`；`tools\test.bat` = 前端 `node --test` **45** 项 + server `unittest` **8** 项（当前全绿）。
- **发版流程**：改代码 → 同步 `VERSION` + `CHANGELOG.md` + `TODO*.md` → `.\rollback.bat backup vX.Y.Z`（先跑 `node --check` + `py_compile` 预检；快照含 `server.py`/`static/`/`VERSION`/`CHANGELOG.md`/插件/`release/`/`README.md`）→ `git add -A` + `git commit` + `git tag -a vX.Y.Z` → `build.ps1` 出包。改代码后**必须重新快照**。
- **最近版本**：0.1.54 跟随系统主题 · 0.1.55 桌面通知 · 0.1.56 数据落盘+按助手清理(含server) · 0.1.57 快捷键/触屏 · 0.1.58 模型搜索折叠 · 0.1.59 多图裁剪批量 · 0.1.60 消息翻译 · 0.1.61 会话列表增强 · 0.1.62 弹窗层级修复+清空回收站 · 0.1.63 OCR 支持 · 0.1.64 自动 OCR 图片拒收修复 · 0.1.65 自动 OCR 进度提示与动效 · 0.1.66 设置内搜索 · 0.1.67 低性能模式 · 0.1.68 工具说明/新手易用性 · 0.1.69 助手弹窗排版整齐化 · 0.1.70 渲染质量滑块+背景升级+高质量动效(含server CSP) · 0.1.71 发布工程骨架(便携打包+新启动器+`/_version`) · 0.1.72 首启向导+内置默认助手+打包安全审计 · 0.1.73 多语言(中/英) · 0.1.74 英文词表补齐+动态自动翻译 · 0.1.75 卸载脚本+安全升级 · 0.1.76 无 Node 自动获取 opencode（npm 源二进制+校验） · 0.1.77 端口占用自动回退修复 404 · 0.1.78 修复连接服务商后模型不显示（自动重启 opencode） · 0.1.79 首次下载 opencode 可见进度条 · 0.2.0 首个对外发布候选（版本管理：快照纳入 `release/`+`README.md`）。
- **OCR 实现要点（0.1.63+，改前必读）**：`js/ocr.js` 经**临时会话**（`~/.config/opencode-chat/ocr-scratch`，用完即删）调模型；设置存 `oc_ocr_model`/`oc_ocr_prompt`/`oc_ocr_variant`（**仅手动指定**，界面优先推荐名称含「OCR」的专用模型）；批量面板收集「附件 + 当前会话图片」；助手配置 `a.autoOcr` 开关，发送时把图片 OCR 成文本 part（格式 `【图片 OCR：文件名】\n…`）发给模型、**不传图片**；被替换的图片以「OCR 文本 hash」为键存 **IndexedDB `oc_ocr_images`**，用户消息渲染时注入气泡显示（刷新仍在）；`send()` 的自动 OCR 分支 + `#ocrProgress` 进度动效；图片能力校验对开启自动 OCR 的助手放行。
- **待人工测试**：多语言（设置/向导切换中英、英文下各弹窗与 toast、切换后动态刷新、老用户不弹向导）；OCR 全链路；会话列表时间/分组/跨助手搜索/最近删除；翻译、多图裁剪、桌面通知、跟随系统主题、渲染质量三档、背景（图片/视频/动态预设）。
- **下一步候选**：干净机/另一设备验收 `dist/opencode-chat-0.2.0.zip` → 通过后定 `1.0.0` 出首个正式包。`TODO-UX.md` 仅剩 P2-13 对话托管体验（可选）。
- **已知问题**：① opencode bash 后台进程会导致工具永久 `running`（P2-b 已缓解，未根治）。② 部分专用 OCR 模型在 opencode 下报错：`DeepSeek-OCR` → `max_tokens(8192) > max_seq_len(8192)`、`PaddleOCR-VL` → ContextOverflow；建议改用视觉模型（实测 `Qwen/Qwen3-VL-8B-Instruct` 正常）。③ 主工作区有 ~9 个早期托管遗留会话未清理（可一次性删除）。
- **文件地图**：入口 `static/index.html`；核心 `js/core.js`（工具/模态/主题/快捷键/通知/图标/渲染质量三档/`TOOL_INFO`/`visibleModalMask`）；`state.js`（状态+自动落盘+`isTrashed`/`assistantForDir`）；`sessions.js`（会话列表/时间分组/跨助手搜索/最近删除）；`providers.js`（模型加载+选择器）；`translate.js`（翻译）；`ocr.js`（OCR 设置/批量面板/自动 OCR/IndexedDB 本地保留）；`media.js`（裁剪/背景图片·视频 IndexedDB·canvas 动态预设/观感）；`settings.js`（设置/清理）；`render.js`/`events.js`（消息渲染/事件流）；`send.js`（发送/自动 OCR 分支）；`assistants.js`（助手含 `autoOcr`）；`attachments.js`（附件/压缩/能力校验/Toast）；`proxy.js`（对话托管）；`favorites.js`（收藏/消息搜索/编辑框）；`onboarding.js`（首启向导/内置默认助手/连通性测试）；`i18n.js`（中英多语言）；后端 `server.py`（代理+CSP+`/_profile`+`/_secret`+`/_version`+`/_opencode/restart`+`/_opencode/status`）；发布工程 `release/`（`launcher.cs`/`launcher.py`/`build.ps1`/`uninstall.bat`/`uninstall.ps1`）、根 `README.md`。

- 基线版本：`v0.2.0`（快照 `backups/v0.2.0-20260912-195113`；`VERSION`=0.2.0、CHANGELOG=v0.2.0 一致；发布包 `dist/opencode-chat-0.2.0.zip`）
- 执行顺序：~~P2-a 安全~~ → ~~P1-c~~ → ~~P2-b bash~~ → ~~缺陷清理~~ → ~~测试~~ → ~~可观测性~~ → ~~可访问性~~
- 计划项全部完成。SSE / esbuild 模块化 / 热路径收敛经评估**明确放弃**（收益低、回归风险高），P2-c 长会话按需渲染保留为「确有卡顿再做」。

## 当前工作区状态
- `v0.2.0` 已出包（首个对外发布候选，功能等同 0.1.79）：`rollback.bat` 快照纳入 `release/` 与 `README.md`；`dist/opencode-chat-0.2.0.zip`。体检全绿（前端 45 + server 8、`node --check`、`py_compile`、便携 Python 产物冒烟 200）。
- `v0.1.79` 已出包：首次下载 opencode 的顶部进度条（launcher 写状态文件 + server `/_opencode/status` + 前端轮询），避免等待时误以为不可用。`server.py` 改动需重启前端。
- `v0.1.78` 已出包：修复「连接服务商后模型选择不显示」——保存 Key 后自动重启 opencode 使插件重读加密密钥，并新增手动重启按钮。
- `v0.1.77` 已出包：端口占用自动回退（非本程序占用则换端口；本程序旧进程则结束升级；未就绪不打开窗口），修复「运行后打开 404」。
- `v0.1.76` 已出包：无 Node 自动获取 opencode（npm 源平台二进制 + shasum 校验 + 镜像回退）。
- `v0.1.75` 已出包：卸载脚本（`uninstall.bat`/`.ps1`）+ 启动器安全升级 + 组件复用。
- `v0.1.74` 已发：英文词表补齐 + `tf()` + `MutationObserver` 动态自动翻译（跳过用户内容）；会话时间/分组、附件超限、OCR 进度、清理/导入/连接等拼接串接入。纯前端，Ctrl+F5。
- `v0.1.73` 已发：多语言框架与语言选择（`js/i18n.js`；设置与首启向导切换；静态界面/工具说明/渲染质量/向导/服务商状态英化）。纯前端，Ctrl+F5。
- `v0.1.72` 已发：首启向导（`js/onboarding.js` 三步；Zen/其它服务商；临时会话连通性测试；老用户自动跳过、设置可重开）+ 内置「使用答疑助手」（Zen 免费模型 + 指南提示词 + 禁用破坏性工具）+ `build.ps1` 安全审计（98 项通过）。纯前端，Ctrl+F5。
- `v0.1.71` 已发：发布工程骨架（`server.py` 加公开 `GET /api/_version`；`release/launcher.cs`+`launcher.py`+`build.ps1`；根 `README.md`；`.gitignore` 加 `dist/`、`release/.cache/`）。实测便携 Python 运行 server.py 且 `/_version` OK、csc 编译+盖章 OK、ZIP 11MB。`server.py` 改动需重启。
- `v0.1.70` 已发：渲染质量滑块（性能优先/标准/高质量，旧低性能模式迁入）+ 背景升级（本地图片/本地视频 IndexedDB/4 个 canvas 动态预设）+ 高质量立体毛玻璃与动效；`server.py` CSP 加 `media-src blob:`（**需重启 server.py 才能用视频背景**，图片/动态预设 Ctrl+F5 即可）。纯前端为主，Ctrl+F5。
- `v0.1.69` 已发：助手弹窗排版整齐化（工具列表改两列 Grid、窄屏单列；`.field-row` 列向 flex + label 撑满使成对字段下拉对齐；字段内 `hint-inline` 独立成行）。纯 CSS，Ctrl+F5。
- `v0.1.68` 已发：工具说明 / 新手易用性（`core.js` `TOOL_INFO`+`toolInfo`；助手→工具勾选显示中文名+灰色说明；对话内工具卡片显示中文名+悬停说明；助手表单补「所属文件夹/工作区目录/默认 Agent/默认模型」提示；`providers.js` 回退列表补 `question`）。纯前端，Ctrl+F5。另：本次重启了 8000 端口的旧 `server.py` 进程，修复 `/_profile` 每 4s 404（见已知问题）。
- `v0.1.67` 已发：低性能模式（设置项 `oc_low_perf`）。开启后：长会话只先渲染最近 40 条 + 「加载更早」（`renderMount` 到 DocumentFragment 再插入）、所有 `backdrop-filter` 关闭、动画/过渡压到亚毫秒、流式事件末尾 UI 刷新用 rAF 合并；设置内有内联提醒 + 「已开启」状态 + 切换 Toast，切换即重渲染当前会话（生成中则延后）。纯前端，Ctrl+F5。
- `v0.1.66` 已发：设置内搜索（弹窗顶部搜索框，按关键词过滤设置项，多词「与」匹配；搜索时自动展开高级设置并隐藏折叠按钮，清除后恢复原折叠状态；含空结果提示；匹配设置文本及输入框 placeholder/title/aria-label）。纯前端，Ctrl+F5。
- `v0.1.65` 已发：自动 OCR 增加进度提示与动效（输入框上方「正在 OCR 识图（n/总数）：文件名」+ spinner/进度条，发送按钮旋转高亮），避免误以为卡死。纯前端，Ctrl+F5。
- `v0.1.64` 已发：修复开启「自动 OCR」时图片在 OCR 前被 `modelSupports` 拒收（`addFiles` 对图片跳过能力校验）。纯前端，Ctrl+F5。
- `v0.1.63` 已发：OCR 支持（设置手动指定模型、优先推荐专用模型；附件/会话图片批量识别面板；助手级「自动 OCR」把图片转文字发送，图片经 IndexedDB 本地保留显示）。纯前端，Ctrl+F5。
- `v0.1.62` 已发：修复多弹窗叠加时确认弹窗被压在下层（`#confirmMask`/`#choiceMask`/`#promptMask` z-index=300，`visibleModalMask` 按 z-index 取顶层）；新增「清空回收站」。纯前端，Ctrl+F5。
- `v0.1.61` 已发：会话列表增强（时间标签 + 按天分组、跨助手搜索、删除后恢复）。纯前端，Ctrl+F5。
- `v0.1.60` 已发：消息翻译（低cost模型 + 可配置提示词/思考强度，可重置）；纯前端，Ctrl+F5。
- `v0.1.59` 已发：多图裁剪批量化（队列第 N/M 张、用原图/全部用原图/应用到其余/上一张）；纯前端，Ctrl+F5。
- `v0.1.58` 已发：顶栏模型选择改为可搜索 + 提供商可折叠浮层；纯前端，Ctrl+F5。
- `v0.1.57` 已发：快捷键扩展（Ctrl+Enter/Alt+N/Ctrl+,/Esc 中止）+ 触屏常显行内操作 + 键盘可达（tabIndex/焦点环）；窄屏适配确认不做。纯前端，Ctrl+F5。
- `v0.1.56` 已发：数据自动落盘（`/_profile` → `profile.json`）+ 导出/导入 + 按助手清理记录；**含 server.py 改动，需重启**。
- `v0.1.55` 已发：桌面通知（回复完成 / 授权 / 提问；仅开启+已授权+失焦时弹）。
- `v0.1.54` 已发：跟随系统主题（外观三段独立选项 亮色/暗色/跟随系统，与主题色解耦）。
- `v0.1.53` 已发：体验 P0（发送不丢内容、统一弹窗+撤销、认证错误修复入口）。
- `v0.1.52`：主题色换皮；`v0.1.51`：风格统一与美化；`v0.1.50`：上下文归零修复。
- `v0.1.49` 已发：可访问性（模态 `role=dialog`/`aria-modal`、Escape 关闭、Tab 焦点陷阱；`permMask` 不允许 Esc）。
- `v0.1.48`：可观测性；`v0.1.47`：测试保护网；`v0.1.46`：缺陷修复与死代码清理；`v0.1.45`：P2-b；`v0.1.44`：P1-c；`v0.1.43`：P2-a。
- 8000 的 `server.py` 自 v0.1.56 后未改；v0.1.57–v0.1.65 全为纯前端，**Ctrl+F5** 即生效；插件改动需重启 opencode。
- 发版前建议先跑 `tools\test.bat`（preflight 默认不跑测试，只做语法检查）。
- 按约定本地开发测试**不使用 git**，故未 commit/tag；如需入库请手动 `git commit` + `git tag <版本>`（不 push）。

## P2-a（已完成 v0.1.43）
1. **依赖本地化 + 版本锁定**：marked 18.0.12 / highlight.js 11.9.0 / KaTeX 0.16.11（含 20 个 woff2）落到 `static/vendor/`，`core.js` 改本地路径。
2. **收掉页内 token**：`server.py` 不再注入 `window.__OC_TOKEN`，前端 `api()` 去掉 `X-OC-Token` 头，纯 HttpOnly Cookie。
3. **CSP + 安全头**：HTML 响应加 CSP；`nosniff` / `no-referrer`；预览页内联脚本用 nonce 放行；补字体 MIME。
4. 验证：临时 8010 实例 index 200/CSP 生效/无 token 注入、Cookie-only API 200、vendor 资源 200 且 MIME 正确。

## P1-c（已完成 v0.1.44）
1. **E2 版本单一来源 + exe 版本**：`VERSION`=0.1.44；`tools/release.bat` 读 `VERSION`，rcedit 缺失时自动下载，写 exe `FileVersion/ProductVersion`=0.1.44.0（实测通过）；`rollback.bat` 快照纳入 `VERSION`。
2. **E3 插件源码入库**：`plugin/base-override.ts` 为源码真相；`install-plugin.bat` 拷安装目录并校验 `opencode.jsonc` 注册（实测通过）；`rollback.bat` 从仓库 `plugin/` 快照并恢复仓库+安装态。

## P2-b（已完成 v0.1.45：bash 长任务可控性）
- 现象：简单 bash 跑数分钟、超时不触发、最后人工中止。实测多例 `timeout=60/120s` 却跑了 360/385s，均 `interrupted=true`。
- 根因（opencode 1.18.30 内嵌实现）：`raceAll([exitCode, abort, sleep(timeout+100ms)])`；命令用 `Start-Process` 起后台子进程后，直接进程很快退出使 `exitCode` 抢先，timeout 永不触发，而子进程占着 stdout 使输出流不结束 → 工具永久 running。属 opencode 侧缺陷，前端/插件无法根治。
- 落地缓解：运行中工具①每秒走秒 ②「中止」按钮（一键 abort）③>90s 高亮 `t-stuck`（`render.js`/`settings.js`/`app.css`）。

## P2-c（已完成 v0.1.67，作为「低性能模式」的可选能力）
- 首次加载最近 40 条 + 顶部「加载更早」（纯前端分批，无需 `limit` 递增）；仅在低性能模式下启用，普通模式仍全量渲染。离屏 markdown/DOMPurify 延迟（IntersectionObserver）**未做**（与流式/版本导航交互复杂，收益有限）。

## 缺陷与清理（已完成 v0.1.46）
- `finalizeMarkdown` 兜底、删 `fireworks.html`、删 `server.py` `/_models`、`usedDirs` 载入归一、`rollback.bat` 回滚整目录替换 `static/`。

## P3（已结束）
- ✅ 可访问性（v0.1.49）。
- ❌ 托管轮询改 SSE、esbuild 模块化、O(消息数) 热路径收敛：评估后放弃（收益低 / 回归风险高）。如需重启可再议。

## 已完成
- **英文词表补齐 + 动态自动翻译（v0.1.74）**：`i18n.js` 新增 `tf()` 与 `MutationObserver`（跳过用户内容、防循环）；补齐各模块动态文案约 200 条；拼接串（加载更早/清理/导入/附件超限/OCR 进度/连接/选择模型）接入 `tf`；会话时间/分组渲染层 `t()`。
- **多语言（v0.1.73）**：`i18n.js`（`t`/`translateDom`/`setLang`/`onLangChange`）；设置「语言」分段控件 + 向导第 1 步语言切换；`boot.js` `applyI18n/initLangSeg`；`core.js` `toolInfo` 经 `t()`；`settings.js` 质量说明 `t()` + `refreshI18nDynamic`；`onboarding.js`/`providers.js` 文案接入。
- **首启向导 + 内置默认助手 + 打包安全审计（v0.1.72）**：`onboarding.js`（`seedDefaultAssistant`/`maybeShowOnboarding`/三步向导/`onboardTestConnection`）；`boot.js` 改用 `seedDefaultAssistant` 并触发向导；设置加「新手向导→重新运行」；`build.ps1` 增审计步骤。
- **发布工程骨架（v0.1.71）**：`/_version`；`release/launcher.cs`（csc 无控制台桩）+ `release/launcher.py`（插件自动装 `plugins/`、起 server、opencode 检测/npm 自动装、Edge `--app`+独立 profile）+ `release/build.ps1`（便携 Python 下载 + 组装 + 编译 + rcedit + ZIP）；根 `README.md`。发布决策与剩余项见 `TODO-RELEASE.md`。
- **渲染质量滑块 + 背景升级 + 高质量动效（v0.1.70）**：`core.js` `renderQuality`/`applyRenderQuality`/`setRenderQuality`（`oc_render_quality`，兼容 `oc_low_perf`）；设置 `.seg` 三档 + 分档提示；`media.js` 背景改下拉（图片/视频/极光/星野/粒子/流光），视频存 IndexedDB `oc_bg_store`，预设 canvas 绘制，`#bgCanvas`/`#bgVideo`；`app.css` `body.quality-high` 立体毛玻璃/悬停/入场/流光；`sessions.js` `bulk-render` 标记避免历史批量入场动画；`server.py` CSP `media-src 'self' blob:`。
- **助手弹窗排版整齐化（v0.1.69）**：`.tool-checks` 两列 Grid（≤560px 单列）；`.field-row > .field` 列向 flex、`label` flex:1 令成对字段下拉底部对齐；`.field > label .hint-inline` 独立一行 11px。
- **工具说明 / 新手易用性（v0.1.68）**：`TOOL_INFO`/`toolInfo`；`renderToolChecks` 两行式（中文名 + 11px 灰说明 + 悬停 `id：说明`）；`updateTool` 标题中文名 + 悬停；助手表单字段提示；`app.css` `.tool-check-*`。
- **低性能模式（v0.1.67）**：设置项 `oc_low_perf`；`core.js` `lowPerfEnabled`/`applyLowPerf`；`render.js` `renderMount` 支持分段渲染到 `DocumentFragment`；`sessions.js` `renderMessageHistory`/`renderEarlierBatch`/`ensureHistoryMessageRendered`（最近 40 条 + 加载更早）；`events.js` `scheduleEventUi` rAF 合并；`settings.js` 开关 + Toast + 重渲染；`app.css` `body.low-perf` 关毛玻璃/动画/过渡。
- **设置内搜索（v0.1.66）**：设置弹窗 `#settingsSearch` 过滤设置项；纯函数 `settingsQueryMatches`（不区分大小写，空格多词「与」）；搜索时展开 `#moreBody` 并隐藏 `#moreToggle`，清除后按 `oc_settings_more` 恢复；`#settingsEmpty` 空结果提示；匹配范围含设置文本与内部 placeholder/title/aria-label。
- **自动 OCR 进度提示（v0.1.65）**：`#ocrProgress`（spinner + 不确定进度条 + 「正在 OCR 识图（n/总数）：文件名」）、发送按钮 `ocr-working` 旋转高亮、标题提示；`updateSendState` 纳入 `ocrSending`；`buildOcrSendParts` 逐张回调进度。
- **自动 OCR 图片拒收修复（v0.1.64）**：`autoOcrEnabled()`；开启自动 OCR 时 `addFiles` 对图片跳过 `modelSupports` 校验（否则纯文本模型在 OCR 前就拒收图片），非图片仍按原逻辑校验。
- **OCR 支持（v0.1.63）**：新增 `ocr.js`；设置内手动指定 OCR 模型（优先推荐名称含「OCR」的专用模型，无则推荐视觉模型）；工具栏/附件「OCR」→ 批量识别面板（附件 + 会话图片，逐张进度、编辑 / 复制 / 插入）；助手级「自动 OCR」开关，开启后发送图片先 OCR 转文字发给模型（图片不作为图片发送），图片经 IndexedDB 本地保留注入对话显示；纯函数 `isOcrModelName`/`isVisionModel`/`ocrDisplayKeyFromParts`。
- **弹窗层级 + 清空回收站（v0.1.62）**：`#confirmMask`/`#choiceMask`/`#promptMask` 提到 `z-index:300`，元弹窗浮于面板弹窗之上；`visibleModalMask()` 按 z-index 取最上层（Esc/焦点陷阱归属正确）；最近删除标题栏新增「清空回收站」（确认后逐个 DELETE 并清空 `S.trash`）。
- **会话列表增强（v0.1.61）**：会话行时间标签（今天 `HH:MM`/昨天/`MM-DD`/跨年）；按天分组标题；跨助手搜索（`/session` 全量 15s 缓存 + `filterSessions` + 助手徽标 + 点击跳转）；删除改为本地「最近删除」回收站（`S.trash` 随 `/_profile` 落盘），支持撤销 / 恢复 / 彻底删除；`session.deleted` 与按助手清理同步回收站。
- **消息翻译（v0.1.60）**：消息操作区「翻译」按钮；低cost翻译模型 + 自定义提示词 / 思考强度（高级设置，可重置）；临时会话调用、不进当前对话；修复 `modelDisplayName` 顶栏显示 id 的问题。
- **多图裁剪批量化（v0.1.59）**：裁剪器队列模式（第 N/M 张），用原图 / 全部用原图 / 应用到其余 / 上一张；`attachments.js` 先收集再批量裁剪。
- **模型选择搜索 + 折叠提供商（v0.1.58）**：`#modelPick` 浮层，按提供商 / 模型名搜索，分组可折叠并持久化；`filterModelGroups` 纯函数。
- **快捷键 + 触屏/键盘（v0.1.57）**：Ctrl+Enter 发送、Alt+N 新会话、Ctrl+, 设置、Esc 中止生成；触屏常显行内操作；行 `tabIndex`+Enter/Space 激活、焦点环；`title`→`aria-label`。
- **数据自动落盘 + 按助手清理（v0.1.56）**：`/_profile` 落盘 `~/.config/opencode-chat/profile.json`，前端 4s 自动保存 / 启动恢复；导出·导入 JSON；按助手清理会话+本地草稿/收藏/最近记录。
- **桌面通知（v0.1.55）**：设置独立开关；回复完成 / `permission.asked` / `question.asked` 弹 Notification，仅「已开启 + 已授权 + 窗口失焦」时触发。
- **跟随系统主题（v0.1.54）**：外观改为独立三态（亮色/暗色/跟随系统），`matchMedia` 监听系统；与主题色、强调色解耦；补 `color-scheme`。
- **体验 P0（v0.1.53）**：发送失败不丢内容；统一确认弹窗（17 处原生 alert/confirm 清零）+ 删除撤销；认证错误「去服务商重连」入口。
- **可访问性（v0.1.49）**：模态 `role=dialog`/`aria-modal`、Escape 关闭、Tab 焦点陷阱。
- **可观测性（v0.1.48）**：`OC_LOG_FILE` 可选日志文件 + 前端「最近错误」面板（24 项纯函数单测）。
- **测试（v0.1.47）**：前端纯函数单测 23 项 + server 冒烟 7 项 + `tools/test.bat`。
- **清理（v0.1.46）**：`finalizeMarkdown` 兜底、删孤文件与 `/_models` 死代码、`usedDirs` 归一、`rollback.bat` 整目录替换。
- **P2-b（v0.1.45）**：bash 长任务可控性（走秒/中止/卡住高亮）+ 根因定位。
- **P1-c（v0.1.44）**：`VERSION` 单一来源 + rcedit 写 exe 版本 + 插件源码入库。
- **P2-a（v0.1.43）**：依赖本地化去 CDN + 纯 Cookie 鉴权 + CSP/安全头。
- **P1-b（v0.1.42）**：D2 工作区不复用（`usedDirs`）；P1 增量 finalize（`dirtyMsgIds`）；P3 托管转录分页；`runProxyStep` 开头清扫 `hosting-scratch`。
- P1-a（v0.1.41）：代理路径白名单 + 令牌 Cookie 化。

## 已知问题 / 观察
- **opencode bash 后台进程卡死**（v0.1.45 定位，未根治）：agent 用 `Start-Process`/`Start-Job` 起后台进程后，bash 工具会永久 `running`、超时不触发；缓解见 P2-b。可从提示词层面劝阻 agent 使用后台进程，或等 opencode 修复。（v0.1.68 重启 server 时再次复现：改用 `Start-Process -RedirectStandardOutput/-RedirectStandardError` 后仍会卡，建议让**用户手动重启** `server.py`。）
- **`/_profile` 报 404**（v0.1.68 排查）：多为 8000 端口仍在跑**旧 `server.py` 进程**（该进程启动时间早于 `server.py` 最近一次改动，缺 `/_profile` 路由，落到代理白名单被 404）。处理：结束旧 `python server.py` 进程后重启即可；确认方法 `Get-NetTCPConnection -LocalPort 8000` 看进程启动时间，或看错误体是 Python 的 `Error response` 页。`server.py` 代码本身无问题。
- **OCR 专用模型兼容性**（v0.1.63 观察）：`siliconflow-cn/deepseek-ai/DeepSeek-OCR` 报 `max_tokens(8192) > max_seq_len(8192)`，`PaddlePaddle/PaddleOCR-VL-1.5` 报 ContextOverflow（opencode/服务商侧限制）；`Qwen/Qwen3-VL-8B-Instruct` 实测正常。设置在推荐专用模型时已加提示，用户可改选视觉模型。
- 遗留：主工作区存在 ~9 个早期托管遗留会话（单条消息、标题为转录片段）；D1 已阻止新增，但旧残留未清理。可一次性删除。
- **i18n 残留**（v0.1.74）：英文模式下仍可能有少数超长拼接句、以及 OCR/翻译/托管的**中文系统提示词**（发往模型的内容，非界面）保持中文；可按需在 `i18n.js` 的 `EN` 表增补，或用 `tf("…{0}…")` 包拼接串。
- 生效方式：改 `server.py` 需重启并 Ctrl+F5；纯前端改 Ctrl+F5 即可。插件改动需重启 opencode。

## 回滚参考
- 整体回滚到某稳定版：`.\rollback.bat v0.2.0-20260912-195113`（或 `backups/` 下任一快照名；默认取最新快照）；若跨 `server.py` 改动，回滚后需重启 `server.py` + Ctrl+F5。快照含 `server.py`/`static`/`VERSION`/`CHANGELOG.md`/插件/`release/`/`README.md`。
- 回滚为交互式：会要求确认，并自动生成 `pre-rollback-*` 安全快照；`rollback.bat list` 可列快照。
- 快照前预检：`rollback.bat backup <label>` 会先跑 `node --check` + `py_compile`，失败即中止。
- git 侧：tag `v0.1.36` / `v0.1.39` / `v0.1.40` / `v0.1.41` / `v0.2.0`；**仅本地，无 remote、不 push**。v0.1.42–v0.2.0 已合并为提交 `07fd933` 并打 `v0.2.0`（annotated），工作树干净。后续发版：`git add -A` → `git commit` → `git tag -a vX.Y.Z`。
