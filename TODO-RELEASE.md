# 发布优化计划（准备发布时启动）

- 目标：**傻瓜式使用** —— 用户只需填 Key，脚本自动安装 opencode 并引导配置。
- 状态：**进行中（对外版 · 便携 ZIP）**；自用体验打磨见 `TODO-UX.md`。

## 已定决策
- **R3 去 Python 依赖**：**内置便携 Python**（`python-3.13.7-embed-amd64`，构建时下载）。实测 `server.py` 仅用标准库，嵌入版可直接跑，`/_version` 冒烟通过。
- **opencode（Node）**：**首次运行自动安装**——有 npm 就 `npm install -g opencode-ai`；找不到 opencode 时在界面打开后后台安装，失败弹窗引导装 Node.js。
- **分发形式**：**便携 ZIP**（解压 → 双击 `opencode-chat.exe`）。自解压安装器后续再议。
- **启动器**：现有 `opencode-chat.exe` 无源码，**改为新编译启动器**（`release/launcher.cs`，用系统 `csc.exe` 编译，无控制台）。
- **插件（R4）**：官方全局插件目录为 `~/.config/opencode/plugins/`（**复数**）且自动加载，优先走该目录，**无需改 `opencode.jsonc`**；若旧配置已注册 `base-override`，则更新旧的 `plugin/`（避免重复加载）。

## 产物与流程
- 源码：`release/launcher.cs`（C# 桩）、`release/launcher.py`（编排）、`release/build.ps1`（打包）。
- 构建：`powershell -ExecutionPolicy Bypass -File release\build.ps1`
  → `dist/opencode-chat/`（可运行目录）+ `dist/opencode-chat-<版本>.zip`。
- 目录布局：
  ```
  opencode-chat.exe        新启动器
  app\  launcher.py + server.py + static\ + plugin\ + VERSION
  runtime\python\          便携 Python
  README.md
  ```
- 数据：`~/.config/opencode-chat/`（profile.json、logs/launcher.log、browser-profile）。Edge 用 `--app` + 独立 `--user-data-dir`。
- 健康检查：`server.py` 新增公开 `GET /api/_version` → `{version,pid}`；启动器据此判断「已在运行 / 旧进程」。

## 任务进度
- **[完成] R3 去 Python 依赖**：便携 Python 内置，打包实测可运行。
- **[完成] R2 进程托管**：启动器检测 8000/4096、按 `/_version` 复用、缺失则启动 server.py 与 `opencode serve`，输出重定向日志；v0.1.75 起可识别并结束本程序旧前端升级；v0.1.77 起端口被非本程序占用时自动改用空闲端口（修复打开后 404）。
- **[完成] 连接服务商即时生效**（v0.1.78）：`server.py` `POST /api/_opencode/restart`，保存 Key 后自动重启 opencode 使插件重读加密密钥；服务商弹窗加手动重启按钮。
- **[完成] 首次下载可见进度**（v0.1.79）：启动器写 `opencode-install.json` + `GET /api/_opencode/status` + 前端顶部进度条。
- **[完成] R4 插件自动安装**：`plugins/` 自动加载 + 旧配置兼容；不再依赖 `install-plugin.bat`。
- **[完成] R6 打包分发（基础）**：`build.ps1` 组装 + 编译 + rcedit 盖版本 + ZIP。
- **[完成] R7 文档（基础）**：根 `README.md`（安装/使用/排障/卸载）。
- **[完成] R1 自动安装 opencode**（v0.1.76）：不再依赖 Node.js——直接从 npm 源下载 `opencode-windows-x64`/`arm64` 包，校验 shasum 后解压出 `opencode.exe` 到 `runtime\opencode\`；官方源优先、失败回退 npmmirror；失败再回退 npm（若有 Node）。（v0.1.71 起的 npm 自动装逻辑保留为兜底。）
- **[完成] R5 首启向导**（v0.1.72）：`js/onboarding.js` 三步向导——欢迎 → 连接服务商（opencode Zen 免费模型 / 其它 Key，实时连接状态）→ 就绪（默认助手/工作区/模型 + 「测试连接」临时会话校验）。老用户自动跳过；设置内可重开。
- **[完成] 内置默认助手**（v0.1.72）：新装 `seedDefaultAssistant()` 创建「使用答疑助手」，默认 Zen 免费模型 + 使用指南系统提示词 + 禁用破坏性工具（bash/write/edit/apply_patch）。
- **[完成] 发布安全审计**（v0.1.72）：`build.ps1` 审计产物无敏感文件、无本机用户名 / `C:\Users\` 绝对路径，不通过即中止；实测 99 项通过。
- **[完成] 多语言（中/英）**（v0.1.73/0.1.74）：`js/i18n.js`；设置与首启向导可切换；静态界面 + 动态文案 + 自动翻译观察器。英文界面便于对外分发；README 目前仅中文（如需可补英文版）。
- **[完成] 卸载功能**（v0.1.75）：产物根目录 `uninstall.bat` + `uninstall.ps1`，交互确认后删除程序目录 / 可选删除用户数据；仅结束本程序进程，**不卸载 opencode / Node**；插件不随卸载删除并给出提示。
- **[完成] 安全升级**（v0.1.75）：启动器识别并结束本程序旧版本服务后以新版启动；已装组件复用不重装；数据与程序目录分离，升级不丢数据。
- **[待做] R1/R2 真机验收**：在**干净 Windows**（无 Node/无 opencode/无 Python）上跑通；补充端口冲突 / 崩溃重启策略。
- **[完成] 发布版本号（候选）**：定为 `0.2.0` 发布候选（对外便携版）；`build.ps1` 已出包 `dist/opencode-chat-0.2.0.zip`。真机验收通过后再定 `1.0.0`。
- **[待做] 可选 R6 增强**：自解压安装器 + 卸载项 + 更新检查。

## 验收
- 全新 Windows 机器：解压 ZIP → 双击 `opencode-chat.exe` → 填 Key → 能对话，**全程无需命令行、无需手动安装 Python**（无 Node 时自动装 opencode，装不上给明确引导）。

## 风险 / 注意
- **opencode 获取方式**：v0.1.76 起直接下载 npm 源的平台二进制（官方优先，回退 npmmirror），**无需 Node.js**；仍属供应链环节，已用包 `shasum` 校验。如需更严可改为固定版本号（当前取 latest）。
- 便携 Python 若被杀软误报，需在 README 说明信任方法。
- 旧进程残留：v0.1.77 起前端端口被本程序旧进程占用会自动结束并升级；被**其它程序**占用则自动改用下一个空闲端口（不再出现打开后 404）。opencode 端口（4096）冲突仍需手动结束旧 `opencode.exe`。
- 隐私：产物已审计不含本机信息；运行期数据仅落 `~/.config/opencode-chat/` 与 opencode 工作区。免费 Zen 模型的数据政策见官方 Zen 文档（部分免费模型声明会用于改进模型），向导/文档宜提示用户勿传敏感信息。
