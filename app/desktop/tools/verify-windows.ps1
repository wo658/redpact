param([Parameter(Mandatory=$true)][string]$Package)
$ErrorActionPreference = "Stop"
$installer = Get-Item $Package
$destination = Join-Path $env:RUNNER_TEMP 'redpact-installed'
$install = Start-Process -FilePath $installer.FullName -ArgumentList "/S /D=$destination" -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Installer failed: $($install.ExitCode)" }
Get-ChildItem $destination
node app/desktop/tools/verify-dmg.mjs "$destination/redpact-desktop.exe" "$destination/runtime"
if ($LASTEXITCODE -ne 0) { throw 'Installed Windows app verification failed' }
$uninstall = Start-Process -FilePath "$destination/uninstall.exe" -ArgumentList '/S' -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw "Uninstaller failed: $($uninstall.ExitCode)" }
for ($attempt = 0; $attempt -lt 30 -and (Test-Path "$destination/redpact-desktop.exe"); $attempt++) { Start-Sleep -Seconds 1 }
if (Test-Path "$destination/redpact-desktop.exe") { throw 'Uninstaller left the app executable behind' }
