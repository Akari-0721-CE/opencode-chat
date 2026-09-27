# Build the opencode chat Android shell (no Gradle / Android Studio needed).
# Usage: powershell -ExecutionPolicy Bypass -File android\build.ps1
#   optional: -Sdk "C:\path\to\Android\Sdk"
param(
    [string]$Sdk = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$Jdk = $env:JAVA_HOME
)

if ($Jdk -and (Test-Path (Join-Path $Jdk "bin\java.exe"))) {
    $env:JAVA_HOME = $Jdk
    $env:PATH = (Join-Path $Jdk "bin") + ";" + $env:PATH
}
Write-Host ("JDK: " + $env:JAVA_HOME)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$bt = Join-Path $Sdk "build-tools\35.0.0"
$androidJar = Join-Path $Sdk "platforms\android-34\android.jar"
$build = Join-Path $here "build"
$gen = Join-Path $build "gen"
$classes = Join-Path $build "classes"
$dex = Join-Path $build "dex"

foreach ($p in @($bt, $androidJar)) {
    if (-not (Test-Path $p)) { throw "Missing Android SDK component: $p (run android\setup-sdk.ps1 first)" }
}

Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $build, $gen, $classes, $dex | Out-Null

Write-Host "[1/7] aapt2 compile"
& "$bt\aapt2.exe" compile --dir "$here\res" -o "$build\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Host "[2/7] aapt2 link"
& "$bt\aapt2.exe" link -o "$build\app-unsigned.apk" -I $androidJar --manifest "$here\AndroidManifest.xml" -R "$build\res.zip" --java $gen --min-sdk-version 24 --target-sdk-version 34 --version-code 2 --version-name 1.1 --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "[3/7] javac"
$javaFiles = @()
Get-ChildItem -Recurse -Filter *.java "$here\src" | ForEach-Object { $javaFiles += $_.FullName }
Get-ChildItem -Recurse -Filter *.java $gen | ForEach-Object { $javaFiles += $_.FullName }
$javac = "javac"
if ($env:JAVA_HOME) { $javac = Join-Path $env:JAVA_HOME "bin\javac.exe" }
& $javac -encoding UTF-8 --release 11 -classpath $androidJar -d $classes $javaFiles
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Host "[4/7] d8"
$classFiles = @()
Get-ChildItem -Recurse -Filter *.class $classes | ForEach-Object { $classFiles += $_.FullName }
& "$bt\d8.bat" --lib $androidJar --min-api 24 --output $dex $classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Host "[5/7] add classes.dex"
Copy-Item "$build\app-unsigned.apk" "$build\app-dex.apk" -Force
& python "$here\add_dex.py" "$build\app-dex.apk" "$dex\classes.dex"
if ($LASTEXITCODE -ne 0) { throw "add classes.dex failed" }

Write-Host "[6/7] zipalign"
& "$bt\zipalign.exe" -f 4 "$build\app-dex.apk" "$build\app-aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "[7/7] sign"
$ks = Join-Path $here "debug.keystore"
if (-not (Test-Path $ks)) {
    $keytool = "keytool"
    if ($env:JAVA_HOME) { $keytool = Join-Path $env:JAVA_HOME "bin\keytool.exe" }
    & $keytool -genkeypair -keystore $ks -alias androiddebugkey -storepass android -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
    if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}
& "$bt\apksigner.bat" sign --ks $ks --ks-pass pass:android --key-pass pass:android --out "$build\opencode-chat.apk" "$build\app-aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

$apk = Join-Path $build "opencode-chat.apk"
$kb = [math]::Round((Get-Item $apk).Length / 1KB, 1)
Write-Host ""
Write-Host "[OK] APK: $apk ($kb KB)"
