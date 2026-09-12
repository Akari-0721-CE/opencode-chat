/* ============ 多语言（中文 / English） ============ */
/* 设计：以中文原文为 key，EN 表提供英文；未命中则回退中文。
   静态界面由 translateDom() 按文本 / 属性精确匹配翻译；动态字符串用 t()。 */
const I18N_KEY = "oc_lang";
let _langCache = null;

const EN = {
  /* ---- 顶栏 / 侧栏 ---- */
  "新建助手": "New Assistant",
  "收藏": "Favorites",
  "新建文件夹": "New Folder",
  "会话": "Sessions",
  "最近删除": "Recently Deleted",
  "新会话": "New Session",
  "搜索会话（跨助手）": "Search sessions (all assistants)",
  "我的昵称与头像": "My name & avatar",
  "你": "You",
  "折叠侧栏": "Collapse sidebar",
  "展开侧栏": "Expand sidebar",
  "本次回复用时": "Reply duration",
  "本会话 Token 用量": "Session token usage",
  "上下文窗口用量": "Context window usage",
  "选择模型": "Select model",
  "（默认模型）": "(Default model)",
  "搜索模型 / 提供商…": "Search model / provider…",
  "搜索模型 / 提供商...": "Search model / provider…",
  "思考强度（reasoning effort）": "Reasoning effort",
  "搜索消息 (Ctrl+F)": "Search messages (Ctrl+F)",
  "设置": "Settings",
  "松开以添加文件": "Drop to add files",
  "回到底部": "Back to bottom",
  "正在 OCR 识图…": "Recognizing text (OCR)…",
  "添加图片或文件": "Add image or file",
  "对话托管": "Conversation hosting",
  "OCR 识图（附件 / 会话图片批量识别）": "OCR images (attachments / session images)",
  "输入消息…（可拖入/粘贴图片或文件）": "Type a message… (drag or paste images/files)",
  "停止": "Stop",
  "发送": "Send",

  /* ---- 对话托管 ---- */
  "托管助手": "Host assistant",
  "用该助手代替「你」生成下一条发言，再作为你的消息发出（其思考过程会一并贴出）。": "Use this assistant to draft your next turn, then send it as your message (its reasoning is included).",
  "托管一步": "Host one turn",
  "自动托管轮数": "Auto-host turns",
  "自动托管": "Auto-host",

  /* ---- 图片查看器 ---- */
  "缩小 (-)": "Zoom out (-)",
  "重置 (0)": "Reset (0)",
  "放大 (+)": "Zoom in (+)",
  "在新标签打开": "Open in new tab",
  "关闭 (Esc)": "Close (Esc)",
  "关闭": "Close",
  "刷新": "Refresh",

  /* ---- 资料 ---- */
  "我的资料": "My Profile",
  "昵称": "Nickname",
  "你（默认）": "You (default)",
  "头像": "Avatar",
  "上传头像": "Upload avatar",
  "清除头像": "Clear avatar",
  "完成": "Done",

  /* ---- 设置：通用 ---- */
  "外观": "Appearance",
  "亮色": "Light",
  "暗色": "Dark",
  "跟随系统": "System",
  "主题色": "Accent color",
  "桌面通知": "Desktop notifications",
  "背景": "Background",
  "无背景": "None",
  "本地图片": "Local image",
  "本地视频": "Local video",
  "动态 · 极光": "Animated · Aurora",
  "动态 · 星野": "Animated · Starfield",
  "动态 · 粒子连线": "Animated · Particles",
  "动态 · 流光网格": "Animated · Flowing grid",
  "选择图片": "Choose image",
  "选择视频": "Choose video",
  "清除背景": "Clear background",
  "背景遮罩": "Background dim",
  "字体大小": "Font size",
  "助手文本居中": "Center assistant text",
  "显示 Token 计数": "Show token count",
  "渲染质量": "Render quality",
  "性能优先": "Performance",
  "标准": "Standard",
  "高质量": "High",
  "新手向导": "Setup wizard",
  "重新运行": "Run again",
  "服务商与模型": "Providers & Models",
  "管理": "Manage",
  "高级设置": "Advanced settings",
  "图片自动压缩": "Auto-compress images",
  "聊天图片裁剪": "Crop chat images",
  "费用单位": "Currency unit",
  "工具超时": "Tool timeout",
  "翻译模型": "Translation model",
  "翻译提示词": "Translation prompt",
  "翻译思考强度": "Translation reasoning",
  "重置": "Reset",
  "重置默认": "Reset default",
  "OCR 模型": "OCR model",
  "OCR 提示词": "OCR prompt",
  "OCR 思考强度": "OCR reasoning",
  "数据备份": "Data backup",
  "导出 JSON": "Export JSON",
  "导入 JSON": "Import JSON",
  "按助手清理记录": "Clean up by assistant",
  "快捷键": "Shortcuts",
  "用量统计": "Usage stats",
  "最近错误": "Recent errors",
  "清空": "Clear",
  "今天": "Today",
  "昨天": "Yesterday",
  "未命名": "Untitled",
  "已开启": "On",
  "全开": "All",
  "全关": "None",
  "（未设置）": "(Not set)",
  "（未设置，用助手模型）": "(Not set · use assistant model)",
  "（默认：非思考）": "(Default: no reasoning)",
  "语言": "Language",
  "界面语言": "Language",

  /* ---- 渲染质量提示 ---- */
  "关闭毛玻璃、界面动画与动态背景动画；长会话只先渲染最近消息（可点「加载更早」）。最省资源，不影响对话功能。":
    "Disables blur, UI animations and animated backgrounds; long sessions render only recent messages first (with a “Load earlier” button). Most efficient; no impact on functionality.",
  "默认观感：毛玻璃与基础动效，动态背景正常播放。":
    "Default look: blur and basic animations; animated backgrounds play normally.",
  "立体毛玻璃 + 悬停/入场动画 + 顶栏/侧栏流光 + 消息收发动效，最华丽；较耗性能，低配机建议用「标准」。":
    "Layered glass, hover/enter animations, topbar/sidebar sheen and message send/receive effects. Best-looking but heavier; use “Standard” on low-end machines.",

  /* ---- 通用按钮 ---- */
  "取消": "Cancel",
  "保存": "Save",
  "删除": "Delete",
  "确定": "OK",
  "选择": "Choose",
  "确认": "Confirm",

  /* ---- 编辑消息 / 裁剪 ---- */
  "编辑并重发": "Edit & Resend",
  "消息内容": "Message content",
  "保存后会删除该消息之后的对话，再以新内容重新发送。": "Saving deletes the conversation after this message and resends with the new content.",
  "保存并重发": "Save & Resend",
  "裁剪图片": "Crop Image",
  "缩放": "Zoom",
  "用原图": "Use original",
  "全部用原图": "All originals",
  "应用到其余": "Apply to rest",
  "上一张": "Previous",
  "裁剪": "Crop",

  /* ---- 服务商 ---- */
  "连接服务商": "Connect Provider",
  "Base URL（可选，如 https://api.example.com/v1）": "Base URL (optional, e.g. https://api.example.com/v1)",
  "自定义模型 ID（每行一个，可选；用于聚合站/账号专属模型，如 Pro/moonshotai/Kimi-K2.6）":
    "Custom model IDs (one per line, optional; for aggregators or account-only models, e.g. Pro/moonshotai/Kimi-K2.6)",
  "选择工作区目录": "Choose Workspace Directory",
  "选择此目录": "Choose This Folder",
  "搜索消息": "Search Messages",
  "输入关键词搜索当前会话消息（空格分隔多个关键词）": "Search this session; separate multiple keywords with spaces",
  "筛选服务商…（点「模型」可用某模型）": "Filter providers… (click “Models” to use one)",
  "OAuth 登录": "OAuth Login",
  "授权码": "Authorization code",
  "粘贴授权码": "Paste authorization code",
  "重新打开授权页": "Reopen auth page",
  "提交授权码": "Submit code",

  /* ---- OCR / 收藏 / 回收站 ---- */
  "OCR 识图": "OCR Images",
  "收集当前附件与当前会话中的图片；逐个识别，结果可编辑 / 复制 / 插入输入框。":
    "Collects current attachments and images in this session; recognize one by one, then edit / copy / insert into the input.",
  "插入到输入框": "Insert into input",
  "复制全部": "Copy all",
  "识别全部": "Recognize all",
  "清空回收站": "Empty Trash",
  "编辑": "Edit",
  "权限确认": "Permission",
  "拒绝": "Deny",
  "允许一次": "Allow once",
  "总是允许": "Always allow",
  "工具": "Tools",
  "默认全部开启；RP / 非编程可关闭": "All enabled by default; disable for RP / non-coding",

  /* ---- 助手编辑 ---- */
  "新建助手": "New Assistant",
  "编辑助手": "Edit Assistant",
  "名称": "Name",
  "图标": "Icon",
  "字符": "Char",
  "所属文件夹": "Folder",
  "工作区目录": "Workspace directory",
  "默认 Agent": "Default agent",
  "默认模型": "Default model",
  "系统提示词（可选，随每条消息发送）": "System prompt (optional, sent with each message)",
  "顶掉 opencode 基底提示词": "Override opencode base prompt",
  "纯净输入": "Clean input",
  "Git 安全": "Git safety",
  "自动 OCR 图片": "Auto OCR images",
  "温度 temperature": "Temperature",

  /* ---- 工具说明 ---- */
  "运行命令": "Run commands",
  "读取文件": "Read files",
  "新建 / 覆盖文件": "Create / overwrite file",
  "编辑文件": "Edit file",
  "查找文件": "Find files",
  "搜索内容": "Search content",
  "派生子任务": "Spawn subtask",
  "抓取网页": "Fetch web page",
  "联网搜索": "Web search",
  "待办清单": "To-do list",
  "向你提问": "Ask you",
  "技能": "Skill",
  "应用补丁": "Apply patch",
  "在电脑上执行终端命令（编译、脚本、git 等）。": "Run terminal commands (build, scripts, git, …).",
  "读取文件或列出一个目录的内容。": "Read a file or list a directory.",
  "创建文件，或整体覆盖写入新内容。": "Create a file or overwrite it entirely.",
  "按「查找 → 替换」精确修改文件里的内容。": "Precisely edit a file via find → replace.",
  "按文件名 / 通配符（如 *.ts）找文件。": "Find files by name / glob (e.g. *.ts).",
  "在文件内容里搜索关键字或正则。": "Search file contents for a keyword or regex.",
  "交给子智能体处理复杂、多步骤的工作。": "Delegate complex, multi-step work to a sub-agent.",
  "读取指定网址的网页并转成文本。": "Fetch a URL and convert it to text.",
  "用搜索引擎查找最新资料。": "Search the web for up-to-date info.",
  "创建 / 更新本次任务的待办列表。": "Create / update the to-do list for this task.",
  "需要你确认或做选择时弹出问题。": "Ask you a question when confirmation is needed.",
  "加载并使用已安装的技能包。": "Load and use an installed skill.",
  "以补丁（diff）形式修改文件。": "Modify files via a diff/patch.",

  /* ---- 常见提示 ---- */
  "已复制": "Copied",
  "复制": "Copy",
  "翻译": "Translate",
  "重新生成": "Regenerate",
  "加载更早消息": "Load earlier messages",
  "已全部加载": "All loaded",
  "加载中…": "Loading…",
  "暂无用量数据": "No usage data",
  "暂无助手": "No assistants",
  "已保存": "Saved",
  "已删除": "Deleted",
  "还没有助手，点击「新建助手」": "No assistants yet — click “New Assistant”",
  "输入消息开始对话": "Type a message to start",
  "输入关键词搜索…": "Type keywords to search…",

  /* ---- 首启向导 ---- */
  "欢迎使用 opencode chat": "Welcome to opencode chat",
  "这是一个本地运行的 AI 对话前端。三步即可开始：": "A locally running AI chat front-end. Get started in three steps:",
  "连接一个模型服务商（可用 opencode Zen 的免费模型，或你自己的 API Key）": "Connect a model provider (opencode Zen free models, or your own API key)",
  "自动创建一个「使用答疑助手」和专属工作区": "Automatically create a “Help Assistant” and its own workspace",
  "开始对话": "Start chatting",
  "所有数据都保存在本机，不会上传到我们的服务器。": "All data stays on this machine and is never uploaded to our servers.",
  "以后再说": "Later",
  "开始配置 →": "Start setup →",
  "连接模型服务商": "Connect a model provider",
  "选择一种方式连接模型：": "Choose how to connect a model:",
  "opencode Zen（推荐）": "opencode Zen (recommended)",
  "官方精选模型，含免费额度（Big Pickle / MiMo Free 等）。需登录 opencode.ai 获取 API Key。":
    "Curated official models with free tiers (Big Pickle / MiMo Free, …). Sign in at opencode.ai to get an API key.",
  "连接 opencode Zen": "Connect opencode Zen",
  "其它服务商": "Other providers",
  "OpenAI / Anthropic / DeepSeek / OpenRouter / 自定义 Base URL 等，填你自己的 API Key。":
    "OpenAI / Anthropic / DeepSeek / OpenRouter / custom base URL, etc. Enter your own API key.",
  "打开服务商管理": "Open provider manager",
  "正在检测已连接的服务商…": "Checking connected providers…",
  "已连接：": "Connected: ",
  "尚未连接任何服务商（可先跳过，稍后在设置里连接）。": "No provider connected yet (you can skip and connect later in Settings).",
  "← 上一步": "← Back",
  "下一步 →": "Next →",
  "准备就绪": "Ready",
  "已为你创建默认助手：": "Your default assistant is ready:",
  "工作区：": "Workspace: ",
  "模型：": "Model: ",
  "可点「测试连接」验证 Key 是否可用。": "Click “Test connection” to verify your key works.",
  "测试连接": "Test connection",
  "完成，开始使用": "Finish and start",
  "正在测试…（最多 60 秒）": "Testing… (up to 60s)",
  "连接正常，模型回复：": "Connection OK. Model replied: ",
  "测试失败：": "Test failed: ",
  "尚无可用的模型（请先连接服务商）": "No model available yet (connect a provider first)",
  "无法确定测试目录（opencode 可能未就绪）": "Cannot determine test directory (opencode may not be ready)",
  "超时，模型无响应": "Timed out; the model did not respond",
  "模型返回错误": "The model returned an error",
  "配置完成，开始对话吧": "Setup complete — start chatting!",
  "使用答疑助手": "Help Assistant",

  /* ---- 服务商管理 ---- */
  "已连接": "Connected",
  "未连接": "Not connected",
  "本地加密": "Encrypted (local)",
  "重新连接": "Reconnect",
  "连接": "Connect",
  "断开": "Disconnect",
  "模型": "Models",
  "手动 API Key（可自定义 Base URL）": "Manual API key (custom base URL)",
  "清除明文": "Clear plaintext",
  "连接 API 服务商（API Key / OAuth）；连接后其模型会出现在顶栏的模型选择中。":
    "Connect API providers (API key / OAuth); their models then appear in the top-bar model picker.",
  "没有匹配的服务商": "No matching providers",
  "加载失败：": "Load failed: ",
  "加载中…": "Loading…",

  /* ---- 会话 / 侧栏动态 ---- */
  "最近删除": "Recently Deleted",
  "暂无会话": "No sessions",
  "暂无删除的会话": "Nothing deleted",
  "没有匹配的会话": "No matching sessions",
  "搜索中…": "Searching…",
  "撤销": "Undo",
  "恢复": "Restore",
  "彻底删除": "Delete permanently",
  "删除会话": "Delete session",
  "重命名": "Rename",
  "重命名会话": "Rename session",
  "收藏此对话": "Favorite this conversation",
  "收藏此消息": "Favorite this message",
  "取消收藏": "Unfavorite",
  "已收藏此消息": "Message favorited",
  "删除（可在最近删除恢复）": "Delete (recoverable from Trash)",
  "删除会话「": "Delete session “",
  "删除文件夹": "Delete folder",
  "删除文件夹「": "Delete folder “",
  "删除文件夹（助手将移到顶层）": "Delete folder (assistants move to top level)",
  "已删除": "Deleted",
  "已删除文件夹「": "Deleted folder “",
  "已删除，可在「最近删除」恢复": "Deleted — recoverable from Trash",
  "已恢复会话「": "Restored session “",
  "彻底删除会话「": "Permanently delete session “",
  "彻底删除回收站中的 ": "Permanently delete ",
  "回收站已是空的": "Trash is empty",
  "已清空回收站（": "Trash emptied (",
  "清理记录": "Clean up records",
  "清理助手「": "Clean up assistant “",
  "清理": "Clean up",
  "已在「最近删除」中": "Moved to Trash",
  "重命名失败：": "Rename failed: ",
  "读取会话失败：": "Failed to load sessions: ",
  "无法加载该工作区的会话：": "Failed to load sessions for this workspace: ",
  "新建会话失败：": "Failed to create session: ",
  "会话已切换，已取消发送": "Session switched; send cancelled",
  "会话已完成回复": "Session finished replying",
  "回复已完成": "Reply finished",
  "已完整": "Complete",
  "未归属": "Unassigned",
  "已删除的助手": "Deleted assistant",
  "原助手已删除，无法打开": "Original assistant was deleted; cannot open",
  "原助手已删除，无法定位": "Original assistant was deleted; cannot locate",
  "原助手已删除，无法恢复该会话": "Original assistant was deleted; cannot restore session",
  "找不到该会话对应的助手（目录：": "No assistant for this session (directory: ",
  "找不到该消息，请刷新会话": "Message not found; refresh the session",
  "该助手还没有会话，点击「新会话」开始": "No sessions yet — click “New Session” to start",
  "记录已清理，点击「新会话」开始": "Records cleared — click “New Session” to start",
  "还没有助手，先新建一个吧": "No assistants yet — create one first",

  /* ---- 消息 / 渲染 ---- */
  "复制": "Copy",
  "复制失败": "Copy failed",
  "复制失败：": "Copy failed: ",
  "复制助手（不含对话）": "Duplicate assistant (no chats)",
  "翻译此消息": "Translate this message",
  "翻译中…": "Translating…",
  "翻译失败：": "Translation failed: ",
  "翻译结果为空（可能超时）": "Empty translation (maybe timed out)",
  "翻译 · ": "Translation · ",
  "重新生成": "Regenerate",
  "重新生成失败：": "Regenerate failed: ",
  "编辑": "Edit",
  "编辑并重发": "Edit & resend",
  "编辑并重发（会清除该消息之后的对话）": "Edit & resend (clears later messages)",
  "编辑失败：": "Edit failed: ",
  "编辑重发失败：": "Edit/resend failed: ",
  "该消息没有可重新发送的内容": "Nothing to resend in this message",
  "找不到对应的用户消息": "Corresponding user message not found",
  "消息内容为空": "Message is empty",
  "原消息已不存在": "Original message no longer exists",
  "原消息已不存在，已定位到会话": "Original message gone; jumped to session",
  "（内容已保留，可直接重试）": "(Content kept — you can retry)",
  "（历史，继续对话以最新版为准）": "(History — latest version wins)",
  "（当前模型不支持）": "(not supported by current model)",
  "（无助手）": "(no assistant)",
  "（最新）": "(latest)",
  "（空）": "(empty)",
  "（空回复）": "(empty reply)",
  "（已截断）": "(truncated)",
  "（未设置）": "(not set)",
  "（未设置目录）": "(no directory)",
  "（未选择）": "(not selected)",
  "（无 / 顶层）": "(None / top level)",
  "（无子目录）": "(no subfolders)",
  "（窗口未知）": "(unknown window)",
  "（默认）": "(default)",
  "（默认模型）": "(default model)",
  "（未识别到文字）": "(no text recognized)",
  "（本地保留，未发送给模型）": "(kept locally; not sent to model)",
  "（留空 Key 仅更新 Base URL / 模型）": "(leave key blank to update only Base URL / models)",
  "暂无": "None",
  "原始": "Original",
  "已裁剪": "Cropped",
  "已压缩": "Compressed",
  "新": "New",
  "提示": "Notice",
  "错误": "Error",
  "失败": "Failed",
  "已完成": "Completed",
  "已截断": "Truncated",
  "文件": "File",
  "图片": "Image",
  "视频": "Video",
  "音频": "Audio",
  "该类型文件": "this file type",
  "附件": "Attachments",
  "未设置": "Not set",
  "默认": "Default",

  /* ---- 用量 / 上下文 ---- */
  "本会话用量": "Session usage",
  "上下文": "Context",
  "上下文用量 ": "Context usage ",
  "上下文≈最近一次的 输入+缓存读+输出": "Context ≈ last Input + Cache read + Output",
  "总 Token": "Total tokens",
  "输入": "Input",
  "输出": "Output",
  "思考": "Reasoning",
  "缓存读": "Cache read",
  "缓存写": "Cache write",
  "费用": "Cost",
  "会话数": "Sessions",
  "剩余": "Left",
  "用时 ": "Time: ",
  "计时 ": "Timer: ",
  "本会话累计：输入 ": "Session total: input ",

  /* ---- 带参数的整句（配合 tf） ---- */
  "加载更早消息（还有 {0} 条）": "Load earlier messages ({0} more)",
  "已清理 {0} 个会话，{1} 个失败": "Cleaned {0} sessions, {1} failed",
  "已清理 {0} 个会话": "Cleaned {0} sessions",
  "「{0}」超过 20 MB 限制": "“{0}” exceeds the 20 MB limit",
  "正在 OCR 识图（{0}/{1}）：{2}": "Recognizing text (OCR) ({0}/{1}): {2}",
  "已导入 {0} 项，即将刷新…": "Imported {0} items; reloading…",
  "正在 OCR 识图（0/{0}）…": "Recognizing text (OCR) (0/{0})…",
  "正在加载 {0} 张图片…": "Loading {0} images…",
  "已选择模型：{0}": "Model selected: {0}",
  "已连接 {0}": "Connected {0}",

  /* ---- 服务商 / OAuth ---- */
  "未找到 opencode Zen，请用「其它服务商」": "opencode Zen not found — use “Other providers”",
  "已连接 ": "Connected ",
  "已连接 ": "Connected ",
  "OAuth 失败：": "OAuth failed: ",
  "OAuth 超时，请重试": "OAuth timed out; try again",
  "发起 OAuth 失败：": "Failed to start OAuth: ",
  "已在浏览器打开授权页，完成后自动返回。": "Authorization page opened in your browser; it will return automatically.",
  "连接到 ": "Connect to ",
  "已保存，正在重启 opencode 使密钥生效…": "Saved; restarting opencode to apply the key…",
  "已连接并生效：{0}": "Connected and active: {0}",
  "已保存，但重启 opencode 失败；可点右上角 ↻ 重启按钮重试": "Saved, but restarting opencode failed; use the restart button at the top-right to retry",
  "正在重启 opencode…": "Restarting opencode…",
  "opencode 已重启": "opencode restarted",
  "重启失败，请查看日志": "Restart failed; check the logs",
  "重启 opencode（使新密钥生效）": "Restart opencode (apply new keys)",
  "正在准备 opencode（首次运行需下载运行组件）…": "Preparing opencode (first run downloads the runtime)…",
  "正在下载 opencode：{0} / {1} MB": "Downloading opencode: {0} / {1} MB",
  "正在下载 opencode… 已 {0} MB": "Downloading opencode… {0} MB so far",
  "正在校验 opencode 完整性…": "Verifying opencode integrity…",
  "正在解压 opencode 运行组件…": "Extracting the opencode runtime…",
  "正在通过 npm 安装 opencode…（可能需要几分钟）": "Installing opencode via npm… (may take a few minutes)",
  "opencode 准备失败：{0}（可重开程序自动重试）": "Failed to prepare opencode: {0} (reopen the app to retry)",
  "未知错误": "Unknown error",
  "正在启动 opencode 本地服务…": "Starting the local opencode service…",
  "保存失败：": "Save failed: ",
  "请输入 API Key": "Please enter an API key",
  "移除": "Remove",
  "移除失败：": "Remove failed: ",
  "已移除本地加密密钥": "Local encrypted key removed",
  "清除明文": "Clear plaintext",
  "清除明文密钥": "Clear plaintext key",
  "清除失败：": "Clear failed: ",
  "已清除明文（已备份 .bak）": "Plaintext cleared (backed up as .bak)",
  "从 opencode auth.json 移除明文密钥（备份为 auth.json.bak）": "Remove plaintext key from opencode auth.json (backup as auth.json.bak)",
  "从 opencode 的 auth.json 移除「": "Remove from opencode auth.json: “",
  "」的明文密钥？（会备份为 auth.json.bak，需已重启 opencode 使加密密钥生效）":
    "” plaintext key? (backs up auth.json.bak; opencode must be restarted for the encrypted key to apply)",
  "刷新失败：": "Refresh failed: ",
  "没有匹配的模型": "No matching models",
  "当前模型": "Current model",

  /* ---- 助手编辑 ---- */
  "编辑助手": "Edit Assistant",
  "在此新建助手": "New assistant here",
  "打开": "Open",
  "查看": "View",
  "收起": "Collapse",
  "展开侧栏": "Expand sidebar",
  "当前助手模型": "Current assistant model",
  "已开启 Git 安全：commit/push 前需确认": "Git safety on: confirm before commit/push",
  "\\nGit 安全：已开启": "\nGit safety: on",
  "自动 OCR 图片": "Auto OCR images",
  "未配置 OCR 模型（设置 → 高级 → OCR 模型）": "OCR model not configured (Settings → Advanced → OCR model)",
  "已开启自动 OCR，但未配置 OCR 模型（设置 → 高级 → OCR 模型）":
    "Auto OCR is on but no OCR model configured (Settings → Advanced → OCR model)",
  "请先在 设置 → 高级 → OCR 模型 里选择模型": "Choose an OCR model in Settings → Advanced → OCR model",
  "自动 OCR 发送失败：": "Auto OCR send failed: ",

  /* ---- OCR ---- */
  "未检测到专用 OCR 模型；可试这些视觉模型（点击选用）：": "No dedicated OCR model found. Try these vision models (click to use):",
  "未检测到专用 OCR 或视觉模型，可在上方手动选择。": "No dedicated OCR or vision model found; pick one above manually.",
  "检测到专用 OCR 模型（点击选用）：": "Dedicated OCR model detected (click to use):",
  "请先选择一个会话": "Select a session first",
  "没有可识别的图片（附件或当前会话中的图片）": "No images to recognize (attachments or session images)",
  "没有待识别的图片": "No images to recognize",
  "待识别": "Pending",
  "识别": "Recognize",
  "识别中": "Recognizing",
  "识别此图片文字": "Recognize text in this image",
  "点击右侧「识别」开始…": "Click “Recognize” on the right to start…",
  "还没有识别结果": "No results yet",
  "（个别专用模型在 opencode 下可能因 max_tokens / 上下文限制报错，此时改用视觉模型即可）":
    "(Some dedicated models may error under opencode due to max_tokens / context limits; switch to a vision model.)",
  "未检测到文字": "No text found",
  "无法确定 OCR 临时目录": "Cannot determine OCR scratch directory",
  "OCR 失败：": "OCR failed: ",
  "已清除 OCR 模型": "OCR model cleared",
  "已恢复默认 OCR 提示词": "Default OCR prompt restored",
  "已恢复默认 OCR 思考强度": "Default OCR reasoning restored",
  "正在 OCR 识图（": "Recognizing text (OCR) (",
  "正在 OCR 识图，请稍候…": "Recognizing text, please wait…",

  /* ---- 翻译 ---- */
  "无法确定翻译临时目录": "Cannot determine translation scratch directory",
  "未配置翻译模型，且当前助手没有默认模型": "No translation model configured, and this assistant has no default model",
  "已清除翻译模型": "Translation model cleared",
  "已恢复默认翻译提示词": "Default translation prompt restored",
  "已恢复默认翻译思考强度": "Default translation reasoning restored",
  "正在清理该消息之后的对话…": "Clearing messages after this one…",

  /* ---- 代理 / 托管 ---- */
  "对话托管（点击选择托管助手）": "Conversation hosting (click to pick a host assistant)",
  "托管失败：": "Hosting failed: ",
  "托管进行中，请稍候": "Hosting in progress, please wait",
  "托管生成超时或为空": "Hosting timed out or returned empty",
  "托管思考": "Host reasoning",
  "已取消托管": "Hosting cancelled",
  "自动托管中，剩余 ": "Auto-hosting, remaining ",
  "请先选择托管助手": "Pick a host assistant first",
  "请先新建或选择一个助手": "Create or select an assistant first",
  "无法确定托管临时目录": "Cannot determine hosting scratch directory",
  "正在生成用户发言…": "Generating user turn…",
  "当前会话还没有可参考的对话": "This session has no prior messages to reference",

  /* ---- 附件 / 裁剪 ---- */
  "附件": "Attachments",
  "裁剪头像": "Crop avatar",
  "裁剪并下一张": "Crop & next",
  "裁剪图片": "Crop image",
  "图片解码失败": "Image decode failed",
  "图片解码失败：": "Image decode failed: ",
  "图片过大，保存失败": "Image too large; save failed",
  "当前环境不支持本地视频背景": "Local video background is not supported here",
  "当前环境不支持桌面通知": "Desktop notifications are not supported here",
  "未获得通知权限，可在浏览器地址栏的权限设置中开启": "Notification permission not granted; enable it in the browser's site settings",
  "视频背景已保存到本机": "Video background saved locally",
  "视频背景已保存": "Video background saved",
  "保存视频失败：": "Failed to save video: ",
  "请先点「选择图片」": "Click “Choose image” first",
  "IndexedDB 不可用": "IndexedDB unavailable",
  "IndexedDB 事务失败": "IndexedDB transaction failed",
  "打开 IndexedDB 失败": "Failed to open IndexedDB",
  "背景已清除": "Background cleared",

  /* ---- 数据 / 设置 ---- */
  "导出失败：": "Export failed: ",
  "导入失败：": "Import failed: ",
  "已导出备份文件": "Backup file exported",
  "已导入 ": "Imported ",
  " 项，即将刷新…": " items; reloading…",
  "文件内容不是有效的备份": "File is not a valid backup",
  "暂无用量数据": "No usage data",
  "暂无助手": "No assistants",
  "按助手清理记录": "Clean up by assistant",
  "清理记录": "Clean up records",
  "个会话": " sessions",
  "个会话）": " sessions)",
  "个会话，": " sessions, ",
  "个会话？此操作不可恢复。": " sessions? This cannot be undone.",
  "个删除失败": " failed",
  "个失败": " failed",
  "个模型": " models",
  "已清理 ": "Cleaned up ",
  "正在加载 ": "Loading ",
  "版本 ": "Version ",
  "已选择模型：": "Model selected: ",
  "已选择 ": "Selected ",
  "已选择：": "Selected: ",
  "连接 ": "Connect ",
  "个会话": " sessions",

  /* ---- 搜索 / 收藏 / 回收站 ---- */
  "条匹配 · 共 ": " matches · total ",
  "条消息": " messages",
  "搜索失败：": "Search failed: ",
  "没有匹配的消息": "No matching messages",
  "输入关键词搜索当前会话消息（空格分隔多个关键词）": "Search this session; separate keywords with spaces",
  "输入关键词搜索当前会话（空格分隔多个关键词，需全部命中）": "Search this session (space-separated; all must match)",
  "收藏的助手（": "Favorite assistants (",
  "收藏的对话（": "Favorite conversations (",
  "收藏的消息（": "Favorite messages (",
  "编辑收藏内容": "Edit favorite content",
  "编辑收藏标题": "Edit favorite title",
  "已彻底删除": "Permanently deleted",
  "导入 JSON": "Import JSON",

  /* ---- 权限 / 问题 ---- */
  "agent 请求权限": "Agent requests permission",
  "agent 请求权限：<code>": "Agent requests permission: <code>",
  "agent 提出了一个问题": "The agent asked a question",
  "需要你的回答": "Your answer is needed",
  "需要授权确认": "Permission needed",
  "需要你确认或做选择时弹出问题。": "Ask you when confirmation or a choice is needed.",
  "等待回答…": "Waiting for answer…",
  "等待问题…": "Waiting for question…",
  "已跳过该问题": "Question skipped",
  "或输入自定义回答…": "Or type a custom answer…",
  "回答问题失败：": "Failed to answer: ",
  "提交": "Submit",
  "跳过": "Skip",
  "拒绝": "Deny",
  "允许一次": "Allow once",
  "总是允许": "Always allow",

  /* ---- 杂项 ---- */
  "初始化失败：": "Initialization failed: ",
  "网络错误：": "Network error: ",
  "发送失败：": "Send failed: ",
  "模型调用失败：": "Model call failed: ",
  "取消": "Cancel",
  "确定": "OK",
  "确认": "Confirm",
  "删除": "Delete",
  "关闭": "Close",
  "保存": "Save",
  "复制全部": "Copy all",
  "已复制": "Copied",
  "已保存": "Saved",
  "保存并重发": "Save & resend",
  "去服务商重连": "Reconnect provider",
  "原图": "Original",
  "用原图": "Use original",
  "全部用原图": "All originals",
  "应用到其余": "Apply to rest",
  "上一张": "Previous",
  "手动 API Key（可自定义 Base URL）": "Manual API key (custom Base URL)",
  "选中": "Selected",
};

function currentLang() {
  if (_langCache) return _langCache;
  try {
    const v = localStorage.getItem(I18N_KEY);
    if (v === "en" || v === "zh") { _langCache = v; return _langCache; }
  } catch (e) { /* ignore */ }
  _langCache = (typeof navigator !== "undefined" && navigator.language && /^en\b/i.test(navigator.language)) ? "en" : "zh";
  return _langCache;
}
function isEn() { return currentLang() === "en"; }
function t(s) {
  if (s == null) return "";
  if (currentLang() === "en" && EN[s] != null) return EN[s];
  return s;
}

const _langListeners = [];
function onLangChange(fn) { _langListeners.push(fn); }
function emitLangChange() {
  for (const fn of _langListeners) { try { fn(); } catch (e) { /* ignore */ } }
}

/* 静态界面按「文本 / 属性」精确匹配翻译（跳过用户内容与代码区） */
const I18N_SKIP = "#messages,.bubble,pre,code,#sessionList,.tree,.search-results,.fav-body,.cleanup-list,.usage-stats,#providerList,.ocr-list,.ocr-text,#dirList,#modelList,#trModelList,#ocrModelList,script,style";
function skipText(node) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  if (!el || !el.closest) return true;
  if (el.closest(I18N_SKIP)) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
function skipAttr(el) {
  if (!el || !el.closest) return true;
  return !!el.closest(I18N_SKIP);
}
function translateDom(root) {
  const scope = root || document.body;
  if (!scope || typeof document.createTreeWalker !== "function") return;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) {
    if (skipText(node)) continue;
    const src = node.__i18nSrc != null ? node.__i18nSrc : node.nodeValue;
    if (src == null) continue;
    const key = String(src).trim();
    if (!key || EN[key] == null) continue;
    if (node.__i18nSrc == null) node.__i18nSrc = src;
    node.nodeValue = isEn() ? src.replace(key, EN[key]) : node.__i18nSrc;
  }
  const attrs = [["placeholder", "data-i18n-src-ph"], ["title", "data-i18n-src-title"], ["aria-label", "data-i18n-src-aria"]];
  scope.querySelectorAll("[placeholder],[title],[aria-label]").forEach((el) => {
    if (skipAttr(el)) return;
    for (const pair of attrs) {
      const attr = pair[0], store = pair[1];
      if (!el.hasAttribute(attr)) continue;
      const src = el.getAttribute(store) != null ? el.getAttribute(store) : el.getAttribute(attr);
      const key = String(src || "").trim();
      if (!key || EN[key] == null) continue;
      el.setAttribute(store, src);
      el.setAttribute(attr, isEn() ? EN[key] : src);
    }
  });
}

function tf(key, ...args) {
  const src = (currentLang() === "en" && EN[key] != null) ? EN[key] : key;
  return src.replace(/\{(\d+)\}/g, (m, i) => (args[+i] != null ? args[+i] : m));
}

/* 动态界面自动翻译：监听 DOM 变化（跳过用户内容区），对新增 chrome 文本/属性翻译 */
let _i18nObserver = null;
let _i18nTimer = null;
let _i18nApplying = false;
function i18nRecordRelevant(records) {
  for (const r of records) {
    const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
    if (el && el.closest && el.closest(I18N_SKIP)) continue;
    return true;
  }
  return false;
}
function applyI18nSoon() {
  if (_i18nTimer) clearTimeout(_i18nTimer);
  _i18nTimer = setTimeout(() => {
    _i18nTimer = null;
    if (_i18nApplying) return;
    _i18nApplying = true;
    try {
      if (_i18nObserver) _i18nObserver.disconnect();
      translateDom(document.body);
    } finally {
      _i18nApplying = false;
      observeI18n();
    }
  }, 120);
}
function observeI18n() {
  if (typeof MutationObserver === "undefined" || !document.body) return;
  if (!_i18nObserver) {
    _i18nObserver = new MutationObserver((records) => {
      if (_i18nApplying) return;
      if (i18nRecordRelevant(records)) applyI18nSoon();
    });
  }
  _i18nObserver.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["placeholder", "title", "aria-label"],
  });
}

function applyI18n() {
  document.documentElement.lang = isEn() ? "en" : "zh-CN";
  translateDom(document.body);
  observeI18n();
}
function setLang(lang) {
  _langCache = (lang === "en") ? "en" : "zh";
  try { localStorage.setItem(I18N_KEY, _langCache); } catch (e) { /* ignore */ }
  document.documentElement.lang = isEn() ? "en" : "zh-CN";
  translateDom(document.body);
  emitLangChange();
  translateDom(document.body);
  if (typeof saveProfile === "function") saveProfile();
}

/* 语言切换控件（设置用） */
function renderLangSeg() {
  const seg = document.getElementById("langSeg");
  if (!seg) return;
  seg.querySelectorAll(".seg-btn").forEach((b) => {
    const on = b.dataset.lang === currentLang();
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });
}
function initLangSeg() {
  const seg = document.getElementById("langSeg");
  if (!seg) return;
  seg.addEventListener("click", (e) => {
    const b = e.target && e.target.closest ? e.target.closest(".seg-btn") : null;
    if (!b) return;
    setLang(b.dataset.lang);
    renderLangSeg();
    if (typeof refreshI18nDynamic === "function") refreshI18nDynamic();
  });
  renderLangSeg();
}
