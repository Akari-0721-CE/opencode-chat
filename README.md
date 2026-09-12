# opencode chat

一个面向 Windows 的 opencode 图形前端：多助手 / 多工作区、会话管理、图片与 OCR、消息翻译、低性能模式、自定义背景与渲染质量等。

本程序把 **opencode**（AI 编码代理）的本地服务 + 一个 Python 代理 + 一个网页前端打包在一起，解压后双击即可使用。

---

## 快速开始

1. 下载并**解压** `opencode-chat-<版本>.zip` 到任意目录（例如 `D:\opencode-chat`）。
2. 双击目录里的 **`opencode-chat.exe`**。
3. 首次启动会自动：
   - 安装 / 更新 opencode 插件；
   - 若本机缺少 opencode，自动下载其 Windows 运行组件到 `runtime\opencode\`（无需安装 Node.js）；
   - 启动本地服务（代理 8000，opencode 4096）；
   - 用 Edge 应用窗口打开界面。
4. 首次进入会弹出**新手向导**：按提示连接模型服务商即可（推荐 opencode Zen，含免费模型；也可填自己的 API Key）。向导会自动创建一个「使用答疑助手」和专属工作区。
5. 之后直接开始对话，或点左侧「新建助手」创建你自己的助手。

> 首次运行会自动下载 opencode 运行组件（约 60–100 MB，来自 npm 官方源，失败时自动回退国内镜像）。**界面顶部会实时显示下载进度**（准备 / 下载 x/y MB / 校验 / 解压 / 启动），下载期间请勿关闭程序；若下载失败，会尝试用 npm 安装（需已装 Node.js），仍失败请检查网络后重新双击。
>
> 想再次打开向导：设置 → 「新手向导 → 重新运行」。
>
> 界面支持 **中文 / English**：设置 → 「语言」，或首次向导第 1 步切换（首次会按系统语言自动选择）。

---

## 隐私说明

- 所有配置与会话数据都保存在**本机**（`%USERPROFILE%\.config\opencode-chat\` 与 opencode 工作区），本程序不上传任何数据。
- 对话内容会按你所选的服务商发送给对应模型。使用第三方/免费模型前，请了解其数据政策，**不要发送敏感或机密信息**。
- 便携 Python 来自官方渠道；opencode 运行组件首次从 npm 源下载（官方源优先，失败回退国内镜像），并校验完整性。

---

## 目录说明

```
opencode-chat\
  opencode-chat.exe      启动器（双击这个）
  uninstall.bat          卸载（双击后在窗口内确认）
  uninstall.ps1          卸载脚本本体
  app\                   程序本体（server.py / static / plugin / VERSION）
  runtime\python\        随包便携 Python（无需单独安装 Python）
  runtime\opencode\      首次运行自动下载的 opencode 运行组件（初始不存在）
  README.md              本文件
```

数据保存在 `%USERPROFILE%\.config\opencode-chat\`：
- `profile.json`：助手 / 收藏 / 草稿 / 设置等（自动保存）。
- `logs\launcher.log`：启动器日志。
- 会话记录存放在 opencode 的工作区目录中。

---

## 常见问题

**双击没反应 / 一直转圈**
- 打开 `%USERPROFILE%\.config\opencode-chat\logs\launcher.log` 查看原因。
- 若提示缺少 `runtime\python`：解压过程不完整，请重新解压。

**界面能开但发消息报错**
- 说明 `opencode` 服务未就绪。先看 `logs\launcher.log` 是否显示 opencode 下载失败；检查网络后重新双击本程序即可自动重试。
- 也可手动执行 `npm install -g opencode-ai`（需已安装 Node.js），然后重新双击。
- 或在设置里检查服务商 API Key 是否正确、是否有余额。

**连接服务商后模型列表看不到**
- 保存 API Key 后程序会**自动重启 opencode** 使密钥生效，稍候模型即会出现（v0.1.78+）。
- 若仍未出现：打开「服务商与模型」，点右上角 **重启 opencode** 按钮重试；再检查 Key / 余额是否正确。
- API Key 以 Windows DPAPI 加密保存在本机（`%USERPROFILE%\.config\opencode-chat\secrets.json`），启动时注入 opencode，不会上传。

**提示「端口被占用」/ 版本不一致**
- 前端端口（默认 8000）若被其它程序占用，启动器会**自动改用下一个空闲端口**并正常打开界面；若 8000 上跑的是本程序旧版本，会结束它并以新版本重启。
- opencode 端口（默认 4096）若被占用，打开任务管理器结束旧的 `opencode.exe` 后重新双击即可。

**打开后是 404 / 不是本程序界面**
- 多半是 8000 端口被别的程序占用、而旧版启动器直接打开了它。升级到 `v0.1.77+` 后会自动改用空闲端口，不再出现该问题。

**换了目录 / 想彻底重置**
- 直接删除 `%USERPROFILE%\.config\opencode-chat\` 即可（会丢失本地设置与记录）。

**想换浏览器窗口大小 / 分辨率**
- 应用窗口是 Edge 应用模式，拖动边缘即可；窗口尺寸会被记住（存在浏览器配置目录里）。

---

## 卸载

1. 双击解压目录里的 **`uninstall.bat`**。
2. 在弹出的窗口中确认卸载；可选择是否一并删除用户数据（`%USERPROFILE%\.config\opencode-chat\`，含设置与密钥）。
3. 完成后删除解压目录（脚本通常已自动删除）。

> 卸载**不会**删除系统全局安装的 opencode、Node.js 或任何全局组件；但随程序目录下载的 `runtime\opencode\` 会随目录一并删除。若希望一并移除本软件安装到 opencode 的插件，请手动删除 `%USERPROFILE%\.config\opencode\plugins\base-override.ts`（以及旧版 `%USERPROFILE%\.config\opencode\plugin\base-override.ts`）。
>
> 也可手动卸载：关闭所有相关窗口后，直接删除解压目录；如需连数据一起清除，再删除 `%USERPROFILE%\.config\opencode-chat\`。

---

## 升级 / 更新

本程序为绿色便携版，升级即「解压覆盖」：

1. 下新版本 ZIP，解压到一个**新的空目录**（或先退出旧版再覆盖旧目录）。
2. 用新目录里的 `opencode-chat.exe` 启动。

- 配置与会话数据都存在 `%USERPROFILE%\.config\opencode-chat\`（与程序目录分离），**升级不会丢失**。
- 启动器会自动识别仍在运行的**旧版本本程序服务**并将其结束，再以新版本启动；旧版与新版混用时不会有版本冲突。
- 已安装的 opencode 运行组件（`runtime\opencode\`）与 Node.js 会被复用，**不会重复下载安装**；插件内容一致时也不会重复写入。

---

## 开发者：重新打包

```powershell
powershell -ExecutionPolicy Bypass -File release\build.ps1
# 产物：dist\opencode-chat\（目录）与 dist\opencode-chat-<版本>.zip
```

依赖：Windows + .NET Framework 4（`csc.exe`），以及网络（首次下载便携 Python）。
