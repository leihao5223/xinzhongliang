# 新中粮全栈部署说明

## 推荐部署方式

当前项目已经不是纯静态站，`/api/*` 由 `app/server` 的 Express 服务提供。推荐把 `D:\xinzhongliang` 作为一个 Node 全栈服务部署：

```powershell
npm install
npm run start
```

默认端口：`3001`。生产环境建议用 Nginx 或平台反向代理到该端口。

## 运行期数据

用户、订单、产品配置、CMS、视频排期等运行期数据会写入：

```text
runtime/data
runtime/uploads
```

这些目录已被 `.gitignore` 忽略，部署时应作为持久化目录备份。

## Vercel 注意事项

如果仍使用 Vercel 托管前台静态文件，需要单独部署后端 Node 服务，并让前台的 `/api/*` 请求转发到后端域名。否则登录、交易、个人资料、订单、后台控台、视频排期都会因为缺少 API 失败。

当前最稳妥的上线方式是单 Node 服务同源托管前台页面和接口。
