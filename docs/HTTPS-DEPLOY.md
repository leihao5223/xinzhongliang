# 生产环境 HTTPS 与 Nginx（最高标准基线）

面向：**自有 VPS + 域名 + Let’s Encrypt**，对外仅暴露 **80/443**，Node 仅监听 **127.0.0.1:3101**，与仓库 `deploy/nginx/`、`app/server/index.js`（`TRUST_PROXY`、`HSTS`）一致。

## 0. 本项目线上域名（已定）

| 项 | 值 |
|----|-----|
| 域名 | **zltx01.com**、**www.zltx01.com** |
| 客户应打开的地址 | **https://zltx01.com/**（不要长期发 `http://` 或 `:3101`） |
| 仓库内现成 Nginx 配置 | **`deploy/nginx/zhongliang-site.zltx01.com.conf`**（复制到 `/etc/nginx/sites-available/zhongliang`） |
| 证书目录（Certbot 默认） | **`/etc/letsencrypt/live/zltx01.com/`** |

**一键申请证书（服务器上，已写邮箱）：**

```bash
certbot certonly --webroot -w /var/www/certbot -d zltx01.com -d www.zltx01.com --agree-tos -m leihao522377@gmail.com --non-interactive
```

---

## 1. 原理（为何不再报「不安全」）

| 现象 | 原因 |
|------|------|
| 地址栏「不安全」 | 使用 **HTTP** 或 **证书无效/不受信**（自签、域名与证书不一致等）。 |
| 仅换域名 | 不配 **受信任 CA 签发的 TLS**，仍可能红。 |
| 落地页跳转 | 若最终仍是 `http://IP:端口`，**跳转后照样不安全**。 |

**稳定做法**：客户只使用 **`https://zltx01.com/`**，Nginx 终止 TLS，反代到本机 Node；证书用 **Let’s Encrypt**（自动续期）。

---

## 2. 前置条件

1. **域名**：已注册，且 DNS **A 记录**（及可选 **AAAA**）指向服务器公网 IP。  
2. **防火墙**：放行 **80、443**；**关闭或限制**对公网 **3101** 的访问（仅本机反代访问）。  
3. **Node / systemd**：生产环境 `NODE_ENV=production`，且 **必须** 设置 `TRUST_PROXY=1`（见下文），以便 Express 识别 `X-Forwarded-Proto: https` 并下发 **HSTS**。  
4. **国内机房**：若使用国内云且域名解析至国内服务器，需遵守 **ICP 备案** 及当地对 80/443 的要求；本文不替代法务流程。

---

## 3. 服务器软件安装（Debian / Ubuntu 示例）

```bash
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx
```

可选（提升部分旧客户端兼容性，耗时数分钟）：

```bash
openssl dhparam -out /etc/nginx/dhparam.pem 2048
```

若生成了 `dhparam.pem`，在 `zhongliang-site.conf` 中取消 `ssl_dhparam` 注释。

---

## 4. 准备 ACME 校验目录

```bash
mkdir -p /var/www/certbot
chown -R www-data:www-data /var/www/certbot
```

---

## 5. 部署 Nginx 站点配置

1. 将 **`deploy/nginx/zhongliang-site.zltx01.com.conf`** 复制到服务器，例如：

   ```bash
   cp /srv/zhongliang/deploy/nginx/zhongliang-site.zltx01.com.conf /etc/nginx/sites-available/zhongliang
   ```

   （若仓库不在 `/srv/zhongliang`，先改该文件里两处 `include .../deploy/nginx/include-proxy-headers.conf` 的绝对路径。）

   或使用通用模板 **`zhongliang-site.conf.example`**，自行替换占位域名。

2. 编辑该文件（若用现成 `zltx01.com` 版通常**无需改域名**）：

   - 确认 **`include /srv/zhongliang/deploy/nginx/include-proxy-headers.conf`** 与服务器路径一致；  
   - **`upstream`** 中端口与 `.env` / systemd 的 **`PORT`**（常见为 **3101**）一致。

3. **旧版 Nginx**（例如 1.22）：示例使用 `listen 443 ssl http2;`。**Nginx ≥ 1.25.1** 起推荐 `listen 443 ssl;` 与独立指令 `http2 on;`，按发行版文档二选一即可。

4. 启用站点：

   ```bash
   ln -sf /etc/nginx/sites-available/zhongliang /etc/nginx/sites-enabled/zhongliang
   ```

5. 若默认站点冲突，可禁用 `default`：

   ```bash
   rm -f /etc/nginx/sites-enabled/default
   ```

---

## 6. 申请 TLS 证书（Certbot）

**首次**：在 HTTP 站点可访问、80 端口开放的前提下：

```bash
certbot certonly --webroot -w /var/www/certbot -d zltx01.com -d www.zltx01.com --agree-tos -m leihao522377@gmail.com --non-interactive
```

或使用交互向导：

```bash
certbot --nginx -d zltx01.com -d www.zltx01.com
```

成功后证书路径一般为：

`/etc/letsencrypt/live/zltx01.com/fullchain.pem`  
`/etc/letsencrypt/live/zltx01.com/privkey.pem`

与配置文件中 `ssl_certificate` 等保持一致。

校验并重载：

```bash
nginx -t && systemctl reload nginx
```

---

## 7. systemd 与 `.env`（必须项）

在 **`zhongliang`** 服务的 **Environment** 中保证（路径按你单位实际）：

```ini
Environment=NODE_ENV=production
Environment=PORT=3101
Environment=TRUST_PROXY=1
```

说明：

- **`TRUST_PROXY=1`**：信任一层 Nginx，Express 才能正确判定 HTTPS，从而在响应中加 **`Strict-Transport-Security`**（HSTS）。  
- 生产默认 **`LISTEN_HOST=127.0.0.1`**（未设置时），Node 不对公网直连开放，由 Nginx 统一入口。

示例片段见 `deploy/systemd/zhongliang.env.example`。

修改后：

```bash
systemctl daemon-reload
systemctl restart zhongliang
```

---

## 8. HSTS 与「preload」（可选、高风险）

应用层在 **HTTPS 请求**下会发送：

- 默认：`max-age=63072000; includeSubDomains`（约 2 年）。  
- 若环境变量 **`HSTS_PRELOAD=1`**：追加 **`preload`**，可申请加入浏览器 **HSTS Preload** 列表。

**警告**：启用 `preload` 前须确认 **所有子域** 长期仅 HTTPS 可用；错误配置会导致子域长期无法访问。仅在充分评估后开启。

---

## 9. 验证清单

```bash
# 本机经 Nginx 的 HTTPS 头
curl -sI https://zltx01.com/api/health | head -n 20

# 应出现 Strict-Transport-Security（由 Node 下发）
curl -sI https://zltx01.com/index.html | grep -i strict

# OCSP / 证书链（外网）
openssl s_client -connect zltx01.com:443 -servername zltx01.com -brief </dev/null
```

浏览器：使用 **SSL Labs** 等在线检测（`https://www.ssllabs.com/ssltest/`）查看等级与链完整性。

---

## 10. 续期与监控

Let’s Encrypt 证书约 **90 天** 有效。Certbot 通常安装 **timer**：

```bash
systemctl status certbot.timer
certbot renew --dry-run
```

建议在监控中告警：**证书过期天数**、**nginx/zhongliang 进程**、**443 端口**。

---

## 11. 与「落地页」的关系

若使用第三方 **仅 HTTPS** 落地页再 **301** 到本站 `https://主域/`，可作为营销入口；**不能**替代本站自身的 TLS。最终业务域名仍应按本文配置 **Nginx + 证书**。

---

## 12. Cloudflare（若使用 CDN）

- 源站与 Cloudflare 之间建议使用 **Full (strict)**，且源站仍配置 **有效证书**（可与对外证书相同或源站专用证书）。  
- 避免长期使用 **Flexible**（浏览器到 CF 为 HTTPS，CF 到源站为 HTTP），不符合「最高标准」与数据安全要求。

---

## 13. 回滚

保留一份无 SSL 的 `listen 80` 仅反代配置备份；证书异常时可临时切回 HTTP 排查（**勿长期运行**）。

---

更多应用打包与 SSH 发布流程见根目录 **[DEPLOY.md](../DEPLOY.md)**。
