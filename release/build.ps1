# opencode chat 发布打包脚本
# 用法：powershell -ExecutionPolicy Bypass -File release\build.ps1
#     可选参数：-PyVersion 3.13.7  -SkipPython  -NoZip
param(
  [string]$PyVersion = "3.13.7",
  [switch]$SkipPython,
  [switch]$NoZip
)
$ErrorActionPreference = "Stop"
$ReleaseDir = $PSScriptRoot
$Root = Split-Path -Parent $ReleaseDir
$Ver = (Get-Content (Join-Path $Root "VERSION") -Raw).Trim()
$Dist = Join-Path $Root "dist"
$Pkg = Join-Path $Dist "opencode-chat"
$Cache = Join-Path $ReleaseDir ".cache"

Write-Host "[build] version=$Ver"

if (Test-Path $Pkg) { Remove-Item $Pkg -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $Pkg "app") -Force | Out-Null

Copy-Item (Join-Path $Root "server.py") (Join-Path $Pkg "app\server.py") -Force
Copy-Item (Join-Path $Root "VERSION")   (Join-Path $Pkg "app\VERSION")   -Force
Copy-Item (Join-Path $ReleaseDir "launcher.py") (Join-Path $Pkg "app\launcher.py") -Force
Copy-Item (Join-Path $Root "static") (Join-Path $Pkg "app\static") -Recurse -Force
Copy-Item (Join-Path $Root "plugin") (Join-Path $Pkg "app\plugin") -Recurse -Force
if (Test-Path (Join-Path $Root "README.md")) {
  Copy-Item (Join-Path $Root "README.md") (Join-Path $Pkg "README.md") -Force
}
Copy-Item (Join-Path $ReleaseDir "uninstall.bat") (Join-Path $Pkg "uninstall.bat") -Force
Copy-Item (Join-Path $ReleaseDir "uninstall.ps1") (Join-Path $Pkg "uninstall.ps1") -Force

if (-not $SkipPython) {
  New-Item -ItemType Directory -Path $Cache -Force | Out-Null
  $zip = Join-Path $Cache "python-$PyVersion-embed-amd64.zip"
  if (-not (Test-Path $zip)) {
    $url = "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip"
    Write-Host "[build] downloading $url"
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      & curl.exe -L -s -S -o "$zip" "$url"
      if ($LASTEXITCODE -ne 0) { Remove-Item $zip -Force -ErrorAction SilentlyContinue; throw "curl 下载失败" }
    } else {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    }
  }
  $pyDir = Join-Path $Pkg "runtime\python"
  New-Item -ItemType Directory -Path $pyDir -Force | Out-Null
  Write-Host "[build] extracting embeddable python -> $pyDir"
  Expand-Archive -Path $zip -DestinationPath $pyDir -Force
} else {
  Write-Host "[build] -SkipPython: 跳过便携 Python（产物不可直接运行）"
}

$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe" }
if (-not (Test-Path $csc)) { throw "未找到 csc.exe（需要 .NET Framework 4 才能编译启动器）" }
Write-Host "[build] compiling launcher"
& $csc /nologo /target:winexe /out:"$Pkg\opencode-chat.exe" /r:System.Windows.Forms.dll (Join-Path $ReleaseDir "launcher.cs")
if ($LASTEXITCODE -ne 0) { throw "csc 编译失败" }

$rcedit = Join-Path $Root "tools\rcedit-x64.exe"
if (Test-Path $rcedit) {
  Write-Host "[build] stamp exe version $Ver.0"
  & $rcedit "$Pkg\opencode-chat.exe" --set-file-version "$Ver.0" --set-product-version "$Ver.0" | Out-Null
}

# ---- 安全审计：产物不得包含本机信息 / 敏感文件 ----
Write-Host "[build] security audit"
$badNames = @("secrets.json", "profile.json", "auth.json", ".env")
$textExt = @(".py", ".js", ".css", ".html", ".md", ".json", ".ts", ".txt", ".webmanifest", ".svg")
$issues = @()
$files = Get-ChildItem $Pkg -Recurse -File
foreach ($f in $files) {
  $rel = $f.FullName.Substring($Pkg.Length).TrimStart('\')
  foreach ($bn in $badNames) { if ($f.Name -ieq $bn) { $issues += "敏感文件: $rel" } }
  if ($f.FullName -match '\\app-profile\\|\\node_modules\\|\\\.git\\|\\backups\\') { $issues += "不应包含目录: $rel" }
  if (($textExt -contains $f.Extension.ToLower()) -and $f.Length -lt 2MB) {
    $txt = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($txt) {
      if ($env:USERNAME -and $txt.ToLower().Contains($env:USERNAME.ToLower())) { $issues += "含本机用户名: $rel" }
      if ($txt -match 'C:\\Users\\') { $issues += "含绝对用户路径: $rel" }
    }
  }
}
if ($issues.Count) {
  $issues | ForEach-Object { Write-Host "  [FAIL] $_" }
  throw "安全审计未通过，已中止打包"
}
Write-Host "[build] audit OK ($($files.Count) files scanned)"

if (-not $NoZip) {
  $zipOut = Join-Path $Dist "opencode-chat-$Ver.zip"
  if (Test-Path $zipOut) { Remove-Item $zipOut -Force }
  Write-Host "[build] packing $zipOut"
  Add-Type -AssemblyName System.IO.Compression | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
  $zip = [System.IO.Compression.ZipFile]::Open($zipOut, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    $base = $Pkg.TrimEnd('\') + '\'
    foreach ($f in Get-ChildItem $Pkg -Recurse -File) {
      $rel = $f.FullName.Substring($base.Length).Replace('\', '/')
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal)
    }
  } finally {
    $zip.Dispose()
  }
}

Write-Host "[build] done -> $Pkg"
