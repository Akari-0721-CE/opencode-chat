# opencode 自建前端 · 版本说明

- 版本：v0.1.41
- 日期：2026-09-12
- 组成：Python 代理 + 多文件前端 + opencode 插件

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

代理环境变量：`OPENCODE_HOST` / `OPENCODE_PORT`（上游，默认 127.0.0.1:4096）、`FRONT_PORT`（默认 8000）。

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `server.py` | 本地代理：`/api/*` 转发到 opencode；静态托管 `static/`（含 `.ico/.svg/.png/.webmanifest` MIME）；`/api/_models` 模型列表；`/api/_mkdir` 创建目录；给非 `index.html` 的 `.html` 注入「返回应用」浮层 |
| `static/index.html` | 前端 HTML 骨架（外部引入 `/css/app.css` 与 `/js/*.js`），连接代理 |
| `static/css/app.css` | 全部样式（由原单文件 `<style>` 拆出） |
| `static/vendor/purify.min.js` | 本地 DOMPurify 3.1.6（Markdown 渲染 HTML 净化，防 XSS） |
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
