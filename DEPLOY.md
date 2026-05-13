# 生产部署规则（打包 · 上传 · 解压 · 重启）

本文档与脚本 `scripts/deploy-remote.ps1`、`scripts/pack-deploy.ps1` 一致，供人工与 Cursor 遵循。

## 环境与路径（当前约定）

| 项 | 值 |
|----|-----|
| SSH | `root@107.149.189.43`，端口 **45464** |
| 上传包路径 | 服务器 **`/tmp/zhong-deploy.tgz`** |
| 解压目标 | **`/srv/zhongliang`**（包内为仓库根内容） |
| 安装依赖目录 | **`/srv/zhongliang/app`**（执行 `npm ci`） |
| 进程管理 | **`systemctl restart zhongliang`** |
| 本机健康检查 | **`http://127.0.0.1:3101`** 下的 `admin-console.html`、`index.html` |

变更服务器、端口、目录或服务名时：改 **`scripts/deploy-remote.ps1`** 顶部「部署参数」块，或按下列命令逐项替换。

## 公网 HTTPS（推荐，消除浏览器「不安全」）

对客户应使用 **`https://你的域名/`**，由 **Nginx + Let’s Encrypt** 终止 TLS 并反代到本机 Node；勿长期用 `http://IP:端口` 对外。

- **完整步骤与校验清单**：[docs/HTTPS-DEPLOY.md](docs/HTTPS-DEPLOY.md)  
- **Nginx 示例**：`deploy/nginx/zhongliang-site.conf.example`、`deploy/nginx/zhongliang-site.zltx01.com.conf`、`deploy/nginx/include-proxy-headers.conf`  
- **环境变量示例**：`deploy/env.production.example`；systemd 片段：`deploy/systemd/zhongliang.env.example`  
- **必设**：`TRUST_PROXY=1`（经反代一层），否则 HSTS 与 `req.secure` 可能不正确。

## 一键部署（推荐）

在仓库根目录 `D:\xinzhongliang`：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-remote.ps1
```

该脚本顺序为：调用 `pack-deploy.ps1` 生成 `zhong-deploy.tgz` → `scp` → `ssh` 解压并 `npm ci` → `systemctl restart` → `ssh` 内 `curl -I` 自检。

## 手动四段式（与线上一致）

### 1）本地打包

```powershell
cd D:\xinzhongliang
powershell -ExecutionPolicy Bypass -File scripts/pack-deploy.ps1
```

（等价于带完整 exclude 的 `tar -czf zhong-deploy.tgz ...`；排除 `node_modules`、`.git`、`runtime`、`.env`、`app/server/data`、`app/server/uploads` 等，见 `scripts/pack-deploy.ps1`。）

### 2）上传

```powershell
scp -P 45464 D:\xinzhongliang\zhong-deploy.tgz root@107.149.189.43:/tmp/zhong-deploy.tgz
```

### 3）解压 + 依赖 + 重启

```powershell
ssh -p 45464 root@107.149.189.43 "set -e; mkdir -p /srv/zhongliang; tar -xzf /tmp/zhong-deploy.tgz -C /srv/zhongliang --exclude='runtime/data/*'; cd /srv/zhongliang/app && npm ci --omit=dev; systemctl restart zhongliang"
```

### 4）本机 HTTP 自检

```powershell
ssh -p 45464 root@107.149.189.43 "curl -I --max-time 8 http://127.0.0.1:3101/admin-console.html && curl -I --max-time 8 http://127.0.0.1:3101/index.html"
```

期望响应行为 `200` 或 `304`。异常时在服务器查看：

```bash
systemctl status zhongliang
journalctl -u zhongliang -n 100 --no-pager
```

## 注意事项

- 服务器需已配置 **`.env`**、**systemd 单元 `zhongliang`**、监听 **3101**（与现网一致）；本文不替你生成密钥或 systemd 文件。
- `tar` 解压使用 `--exclude='runtime/data/*'` 时，避免用错误包覆盖线上数据目录；若需整包覆盖数据，去掉该 exclude 并自行备份。
- 上传包仅到 `/tmp`；部署完成后可 `rm -f /tmp/zhong-deploy.tgz` 节省空间（可选）。
