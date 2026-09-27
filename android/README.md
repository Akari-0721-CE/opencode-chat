# opencode chat · 安卓 App（WebView 壳）

一个极简的安卓客户端：启动后填写 PC 的局域网地址（如 `192.168.137.1:8000`），
内嵌 WebView 全屏加载网页端，等于把浏览器里的应用变成独立 App，避免浏览器地址栏、
PWA 安全上下文等限制。

## 特性
- 全屏沉浸（隐藏状态栏/导航栏）；可在「设置」关闭沉浸，支持网页 Fullscreen API（视频等）。
- **暗色模式与基础设置**（返回键菜单或网页顶栏「安卓设置」）：暗色模式（跟随系统 / 亮色 / 暗色）、字号（小/标准/大）、保持屏幕常亮、清除缓存并刷新、重新加载、更换主机地址。设置存本机 `SharedPreferences`。
- 允许明文 HTTP（局域网 IP 可直接用）。
- 记住主机地址；可选记住密码并自动登录（页面出现登录框时自动填入）。
- **端口预设 / 常用地址**：连接页只需填 IP，端口用预设（默认 8000，可在壳内「设置 → 默认端口」修改）；自动记住最近 5 个地址，下次一键连接。
- 返回键：优先网页后退，到顶后弹出「设置 / 更换主机地址 / 重新加载 / 退出」。
- **文件查看 / 保存 / 分享**：图片查看器与消息文件可保存或分享到手机（内建 `content://` provider，无需存储权限）；http(s) 下载交给系统浏览器。
- **上传**：支持网页内的文件选择（图片/附件，可多选）与「拍照上传」。
- 仅需 `INTERNET` / `ACCESS_NETWORK_STATE` 权限；不申请存储/相机权限（用系统文件选择器 / 相机应用）。

## 构建

前置：JDK 17–21、Android SDK（platform android-34、build-tools 35.0.0）。
本机已装好 SDK（`%LOCALAPPDATA%\Android\Sdk`）；若换机器：

```powershell
powershell -ExecutionPolicy Bypass -File android\setup-sdk.ps1
```

构建 APK：

```powershell
powershell -ExecutionPolicy Bypass -File android\build.ps1 -Jdk "C:\path\to\jdk-21"
```

产物：`android\build\opencode-chat.apk`（未签名调试包，已用 debug 证书签名 v2）。

> 注意：`d8`（build-tools **35.0.0**）必需；34.0.0 的 R8 在处理匿名内部类时会崩溃。
> JDK 建议 17–21；**实测 JDK 25 + build-tools 35.0.0 也能出包**（若 d8 报错再换 17–21）。

## 安装到手机
1. 把 `opencode-chat.apk` 传到手机（数据线、微信文件传输、或直接在手机浏览器打开
   `http://<PC-IP>:8000/opencode-chat.apk` 下载——构建后脚本会把它拷到 `static/` 供下载）。
2. 手机上允许「安装未知来源应用」，安装。
3. 打开 App，填 PC 的局域网地址（设置 → 局域网访问 里显示的地址），连接。
   - 若开了访问密码，填一次即可自动登录（也可先在网页端登录）。
4. 长按/返回键可重新设置地址。

## 源码结构
```
android/
  AndroidManifest.xml
  src/com/opencodechat/mobile/MainActivity.java      # WebView 壳 + 设置 + 网页桥接
  src/com/opencodechat/mobile/FileProviderLite.java  # 极简 content:// provider（保存/分享文件）
  res/values/strings.xml
  res/values/styles.xml
  res/xml/network_security_config.xml
  res/mipmap-*/ic_launcher.png
  build.ps1        # 手动编译（aapt2 + javac + d8 + zipalign + apksigner）
  setup-sdk.ps1    # 下载/安装 Android SDK
  add_dex.py       # 把 classes.dex 塞进 APK
```
