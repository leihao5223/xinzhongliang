# 一键：打包 -> scp 上传 -> 远端解压 -> npm ci -> systemctl 重启 -> curl 自检
# 在仓库根目录执行: powershell -ExecutionPolicy Bypass -File scripts/deploy-remote.ps1
# 仅修改下方「部署参数」块；其余勿动。

$ErrorActionPreference = 'Stop'

# ========== 部署参数（按你当前线上环境）==========
$SshHost     = '107.149.189.43'
$SshPort     = 45464
$SshUser     = 'root'
$RemoteTgz   = '/tmp/zhong-deploy.tgz'
$InstallRoot = '/srv/zhongliang'
$NpmDir      = '/srv/zhongliang/app'
$SystemdUnit = 'zhongliang'
$HealthPort  = 3101
# ================================================

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$packScript = Join-Path $PSScriptRoot 'pack-deploy.ps1'
$tgz = Join-Path $root 'zhong-deploy.tgz'

Write-Host '== 1/4 本地打包 ==' -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File $packScript
if (-not (Test-Path $tgz)) { throw "未找到 $tgz" }

Write-Host '== 2/4 scp 上传 ==' -ForegroundColor Cyan
& scp -P $SshPort $tgz "${SshUser}@${SshHost}:$RemoteTgz"
if ($LASTEXITCODE -ne 0) { throw "scp failed exit $LASTEXITCODE" }

$remoteShell = "set -e; mkdir -p '$InstallRoot'; tar -xzf '$RemoteTgz' -C '$InstallRoot' --exclude='runtime/data/*'; cd '$NpmDir' && npm ci --omit=dev; systemctl restart '$SystemdUnit'"

Write-Host '== 3/4 远端解压 + 依赖 + 重启 ==' -ForegroundColor Cyan
& ssh -p $SshPort "${SshUser}@${SshHost}" $remoteShell
if ($LASTEXITCODE -ne 0) { throw "ssh deploy failed exit $LASTEXITCODE" }

$curlShell = "curl -sI --max-time 8 http://127.0.0.1:${HealthPort}/admin-console.html | head -n1; curl -sI --max-time 8 http://127.0.0.1:${HealthPort}/index.html | head -n1"

Write-Host '== 4/4 本机 HTTP 头自检 ==' -ForegroundColor Cyan
& ssh -p $SshPort "${SshUser}@${SshHost}" $curlShell
if ($LASTEXITCODE -ne 0) { throw "ssh curl check failed exit $LASTEXITCODE" }

Write-Host ''
Write-Host 'Done. 若 HTTP 非 2xx，在服务器执行: journalctl -u ' -NoNewline
Write-Host $SystemdUnit -NoNewline -ForegroundColor Yellow
Write-Host ' -n 80 --no-pager' -ForegroundColor Yellow
