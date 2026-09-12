param(
    [string]$InstallDir
)

$ErrorActionPreference = "SilentlyContinue"

try {
    chcp 65001 | Out-Null
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

try { Set-Location $env:TEMP } catch {}

function Write-Line($text) { Write-Host $text }

if (-not $InstallDir) { $InstallDir = $env:OC_UNINSTALL_DIR }
if (-not $InstallDir) {
    Write-Line "无法确定安装目录，卸载中止。"
    Read-Host "按回车退出"
    exit 1
}
$InstallDir = $InstallDir.TrimEnd('\')
if (-not (Test-Path -LiteralPath $InstallDir)) {
    Write-Line "安装目录不存在：$InstallDir"
    Read-Host "按回车退出"
    exit 1
}

$dataDir = Join-Path $env:USERPROFILE ".config\opencode-chat"

Write-Line ""
Write-Line "=============================================="
Write-Line "  opencode chat 卸载"
Write-Line "=============================================="
Write-Line "程序目录：$InstallDir"
Write-Line "用户数据：$dataDir"
Write-Line ""
Write-Line "说明：本操作不会卸载系统全局安装的 opencode、Node.js 或任何全局组件；"
Write-Line "      随程序目录下载的 runtime\opencode 会随程序目录一并删除。"
Write-Line ""

$ok = Read-Host "确定要卸载 opencode chat 吗？[y/N]"
if ($ok -notmatch '^[yY]') {
    Write-Line "已取消。"
    Read-Host "按回车退出"
    exit 0
}

$delData = $false
$ans = Read-Host "是否同时删除用户数据（设置 / 密钥 / 会话索引，删除后不可恢复）？[y/N]"
if ($ans -match '^[yY]') { $delData = $true }

# 1) 结束本程序进程（仅限安装目录内的进程；不触碰 opencode）
$prefix = $InstallDir + '\'
$killed = 0
Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
} | ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force; $killed++ } catch {}
}
Write-Line "已结束本程序进程：$killed 个"

# 结束本程序打开的 Edge 应用窗口（仅限使用本程序浏览器配置目录的窗口）
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine -like "*opencode-chat*browser-profile*"
} | ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force } catch {}
}

Start-Sleep -Milliseconds 800

function Remove-DirWithRetry([string]$path) {
    for ($i = 0; $i -lt 10; $i++) {
        try {
            Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
        } catch {}
        if (-not (Test-Path -LiteralPath $path)) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return -not (Test-Path -LiteralPath $path)
}

# 2) 删除程序目录
Write-Line "正在删除程序目录 ..."
if (Remove-DirWithRetry $InstallDir) {
    Write-Line "  已删除：$InstallDir"
} else {
    Write-Line "  [失败] 程序目录未能完全删除，可能有进程仍在占用。"
    Write-Line "  请关闭所有相关窗口后手动删除：$InstallDir"
}

# 3) 删除用户数据
if ($delData) {
    Write-Line "正在删除用户数据 ..."
    if (Remove-DirWithRetry $dataDir) {
        Write-Line "  已删除：$dataDir"
    } else {
        Write-Line "  [失败] 用户数据未删除，请关闭应用窗口后重试：$dataDir"
    }
} else {
    Write-Line "已保留用户数据：$dataDir"
}

# 4) 插件说明（按约定不随卸载删除）
$pluginAuto = Join-Path $env:USERPROFILE ".config\opencode\plugins\base-override.ts"
$pluginCompat = Join-Path $env:USERPROFILE ".config\opencode\plugin\base-override.ts"
if ((Test-Path -LiteralPath $pluginAuto) -or (Test-Path -LiteralPath $pluginCompat)) {
    Write-Line ""
    Write-Line "注意：本软件安装到 opencode 的插件未随卸载删除："
    if (Test-Path -LiteralPath $pluginAuto)   { Write-Line "  $pluginAuto" }
    if (Test-Path -LiteralPath $pluginCompat) { Write-Line "  $pluginCompat" }
    Write-Line "如需一并移除，可手动删除上述文件（不影响 opencode 本体）。"
}

Write-Line ""
Write-Line "卸载完成。"
Read-Host "按回车退出"

try { Remove-Item -LiteralPath $PSCommandPath -Force } catch {}
