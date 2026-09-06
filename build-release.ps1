# Builds the signed Play Store bundle (.aab) and a sideloadable release .apk.
# Requires: Node, JDK 21 (Temurin), Android SDK at C:\AndroidSdk (see README.md).
$ErrorActionPreference = "Stop"
$env:JAVA_HOME = (Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory | Where-Object Name -like "jdk-21*" | Select-Object -First 1).FullName
$env:ANDROID_HOME = "C:\AndroidSdk"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

Set-Location $PSScriptRoot
npx cap sync android
Set-Location "$PSScriptRoot\android"
.\gradlew.bat bundleRelease assembleRelease --no-daemon
Set-Location $PSScriptRoot

$ver = (Select-String -Path android\app\build.gradle -Pattern 'versionName "([^"]+)"').Matches[0].Groups[1].Value
New-Item -ItemType Directory -Force release | Out-Null
Copy-Item android\app\build\outputs\bundle\release\app-release.aab "release\scrappy-bird-$ver.aab" -Force
Copy-Item android\app\build\outputs\apk\release\app-release.apk "release\scrappy-bird-$ver.apk" -Force
Write-Host "Done -> release\scrappy-bird-$ver.aab (upload this to Play Console)"
