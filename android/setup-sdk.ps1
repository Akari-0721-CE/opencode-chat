# One-time: download the Android command-line tools and required SDK packages.
# Usage: powershell -ExecutionPolicy Bypass -File android\setup-sdk.ps1
#   optional: -Sdk "C:\Android\Sdk" -Jdk "C:\path\to\jdk-21"
param(
    [string]$Sdk = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$ToolsUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip",
    [string]$Jdk = $env:JAVA_HOME
)

$ErrorActionPreference = "Stop"
if ($Jdk -and (Test-Path (Join-Path $Jdk "bin\java.exe"))) {
    $env:JAVA_HOME = $Jdk
    $env:PATH = (Join-Path $Jdk "bin") + ";" + $env:PATH
}

$tmp = Join-Path $env:TEMP "oc-android-sdk"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp "cmdline-tools.zip"
if (-not (Test-Path $zip)) {
    Write-Host "Downloading command-line tools ..."
    & curl.exe -L -o $zip $ToolsUrl
}

$extract = Join-Path $tmp "extract"
Remove-Item -Recurse -Force $extract -ErrorAction SilentlyContinue
Expand-Archive -Path $zip -DestinationPath $extract -Force

New-Item -ItemType Directory -Force -Path (Join-Path $Sdk "cmdline-tools") | Out-Null
$latest = Join-Path $Sdk "cmdline-tools\latest"
if (Test-Path $latest) { Remove-Item -Recurse -Force $latest }
Move-Item (Join-Path $extract "cmdline-tools") $latest

$sm = Join-Path $latest "bin\sdkmanager.bat"
Write-Host "Accepting licenses ..."
(1..50 | ForEach-Object { 'y' }) -join "`n" | & $sm --sdk_root=$Sdk --licenses

Write-Host "Installing packages ..."
& $sm --sdk_root=$Sdk "platform-tools" "platforms;android-34" "build-tools;35.0.0"
Write-Host "SDK ready at $Sdk"
