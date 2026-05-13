# Pack repo for server upload (excludes node_modules, .git, runtime, .env, etc.)
# Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/pack-deploy.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

$out = Join-Path $root 'zhong-deploy.tgz'
if (Test-Path $out) { Remove-Item $out -Force }

$tarArgs = @(
  '-czf', $out,
  '--exclude=./node_modules',
  '--exclude=./.git',
  '--exclude=./zhong-deploy.tgz',
  '--exclude=./zhong-deploy-*.tgz',
  '--exclude=./.cursor',
  '--exclude=./terminals',
  '--exclude=./runtime',
  '--exclude=./.env',
  '--exclude=./.env.*',
  '--exclude=./app/server/data',
  '--exclude=./app/server/uploads',
  '.'
)
Write-Host "Packing: $root -> $out"
& tar @tarArgs
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit $LASTEXITCODE" }
$item = Get-Item $out
Write-Host ("OK " + [math]::Round($item.Length / 1MB, 2) + " MB")
Write-Host ""
Write-Host "Excluded: runtime/, app/server/data/, app/server/uploads/, .env, node_modules, .git"
Write-Host "Hero video: assets/videos/home-hero-loop.mp4"
Write-Host "一键上传+解压+重启: powershell -ExecutionPolicy Bypass -File scripts/deploy-remote.ps1"
Write-Host "说明见 DEPLOY.md"
