# CoolMonitor

CoolMonitor 是一套可部署到 Cloudflare Workers 的轻量监控系统。前端静态页面、JSON API、定时检测和通知逻辑运行在同一个 Worker 中，数据存储在 Cloudflare D1。

## 功能

- HTTP/HTTPS 状态与响应时间监控
- 页面关键词“包含 / 不包含”检测
- JSON API 字段路径与期望值断言
- SSL 证书与 TLS 握手检测
- TCP 端口连通性检测，例如 SSH `example.com:22`
- GET、POST、PUT、PATCH、DELETE、HEAD 请求
- 自定义请求头、请求体和 User-Agent 字典
- 保存完整请求包和响应包
- 仪表盘、运行状态时间带和响应时间趋势
- 监控日志筛选、分页、批量删除和自动清理
- 管理员、普通用户、访问者及按钮级权限
- Telegram、企业微信 Webhook、Cloudflare 原生邮件通知
- 故障和恢复通知模板

## 技术结构

```text
浏览器
  └─ Cloudflare Worker
       ├─ static/ 静态前端
       ├─ worker.js API、检测和定时任务
       ├─ D1 数据库
       └─ Email / Telegram / 企业微信通知
```

项目使用 Workers Static Assets 提供前端文件，`/api/*` 请求由 Worker 处理。参考 [Cloudflare Static Assets 文档](https://developers.cloudflare.com/workers/static-assets/binding/)。

## 开源数据说明

仓库只保留一个数据库文件：`schema.sql`。

- 包含完整表结构、索引和系统菜单。
- 不包含真实用户、密码哈希、Token、邮箱、Webhook、Cookie 或历史监控数据。
- 仅包含一条指向 `https://example.com` 的匿名演示监控和一条演示日志。
- 数据库没有预置管理员。首次打开系统时注册入口可见，第一个注册账号会成为管理员；创建管理员后公开注册自动关闭。

如果不需要演示数据，初始化后执行：

```bash
npx wrangler d1 execute coolmonitor --remote --command="DELETE FROM checks; DELETE FROM sites;"
```

## 部署要求

- Cloudflare 账号
- Node.js 20 或更高版本
- npm
- Wrangler 4.x（下面使用 `npx wrangler`，无需全局安装）

确认版本：

```bash
node --version
npx wrangler --version
```

## 一、下载并登录 Cloudflare

```bash
git clone https://github.com/YOUR_USERNAME/coolmonitor.git
cd coolmonitor
npx wrangler login
```

浏览器会打开 Cloudflare 授权页面，选择要部署到的账号。

## 二、创建 D1 数据库

```bash
npx wrangler d1 create coolmonitor
```

命令会返回数据库 ID。打开 `wrangler.toml`，替换：

```toml
database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

例如：

```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

不要使用其他人的数据库 ID。D1 创建和初始化流程可参考 [Cloudflare D1 入门文档](https://developers.cloudflare.com/d1/get-started/)。

## 三、初始化数据库

将完整结构和匿名演示数据写入远程 D1：

```bash
npx wrangler d1 execute coolmonitor --remote --file=./schema.sql
```

验证表结构：

```bash
npx wrangler d1 execute coolmonitor --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

应该能看到 `checks`、`menus`、`notify`、`settings`、`sites` 和 `users`。

## 四、配置登录密钥

系统使用 `JWT_SECRET` 签发登录令牌。生成随机值：

macOS / Linux：

```bash
openssl rand -hex 32
```

PowerShell：

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

写入 Cloudflare Secret：

```bash
npx wrangler secret put JWT_SECRET
```

按提示粘贴随机值。不要将密钥写入 `wrangler.toml`、源码或 GitHub。Cloudflare 也明确建议密钥只使用 Secret 管理，参考 [Workers 安全最佳实践](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)。

## 五、部署

```bash
npx wrangler deploy
```

完成后 Wrangler 会返回类似地址：

```text
https://coolmonitor.YOUR_SUBDOMAIN.workers.dev
```

直接打开该地址即可。前端和 API 使用同一域名，不需要修改 `static/js/app.js`。

首次部署流程：

1. 打开 Worker 地址。
2. 点击“注册管理员”。
3. 创建第一个管理员账号，密码至少 6 位。
4. 返回登录页并登录。
5. 删除或编辑匿名演示监控。

## 六、本地开发

创建 `.dev.vars`（该文件已被 `.gitignore` 排除）：

```text
JWT_SECRET=local-development-secret-change-me
```

初始化本地 D1：

```bash
npx wrangler d1 execute coolmonitor --local --file=./schema.sql
```

启动本地 Worker：

```bash
npx wrangler dev
```

打开 Wrangler 输出的本地地址，通常是 `http://localhost:8787`。

不建议只用 `python -m http.server` 运行前端，因为前端默认使用当前域名访问 `/api/*`，完整调试应使用 `wrangler dev`。

## 七、定时检测

`wrangler.toml` 默认配置：

```toml
[triggers]
crons = ["* * * * *"]
```

Worker 每分钟被唤醒一次，但每个监控仍按照各自的“检测间隔”判断是否执行，不会因此全部每分钟检测。监控管理中的“立即检测”只强制检测当前选择的监控，不改变定时计划。

修改 Cron 后重新执行：

```bash
npx wrangler deploy
```

## 八、监控类型

| 类型 | 地址示例 | 用途 |
|---|---|---|
| HTTP | `https://example.com` | 检查 HTTP 状态码和响应时间 |
| 关键词 | `https://example.com/login` | 检查响应正文包含或不包含文本 |
| JSON API | `https://api.example.com/health` | 按字段路径断言 JSON 值 |
| SSL 证书 | `https://example.com` | 检查证书有效期及 TLS 握手 |
| TCP 端口 | `example.com:22` | 检查 SSH、数据库等 TCP 端口能否连接 |

TCP 检测只验证端口是否能够建立连接，不执行 SSH 登录或应用层认证。

## 九、通知配置

通知配置保存在 D1 的 `settings` 表中。仓库中的默认配置全部关闭且不包含凭据。

### Telegram Bot

1. 在 Telegram 中向 `@BotFather` 发送 `/newbot`。
2. 保存 BotFather 返回的完整 Bot Token。
3. 打开刚创建的机器人并发送 `/start`。
4. 访问以下地址，把占位符替换成自己的 Token：

   ```text
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```

5. 在返回 JSON 中找到 `message.chat.id`。Token 冒号前的数字是 Bot ID，不是 Chat ID。
6. 在 CoolMonitor 的“通知设置”中启用 Telegram，填写 Bot Token 和 Chat ID。
7. 保存并发送测试通知。

如果 Token 泄露，请立即在 BotFather 使用 `/revoke` 撤销并重新生成。

### 企业微信 Webhook

1. 在企业微信群中添加群机器人。
2. 复制机器人 Webhook 地址。
3. 在通知设置中启用企业微信并粘贴 Webhook。
4. 保存并发送测试通知。

Webhook 等同于发送凭据，不要提交到 Git。

### Cloudflare 原生邮件

Cloudflare 邮件发送要求发件域名已接入 Email Service，并且收件地址已验证。官方绑定格式见 [Workers Email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) 和 [发送绑定配置](https://developers.cloudflare.com/email-service/configuration/send-bindings/)。

`wrangler.toml` 已包含：

```toml
[[send_email]]
name = "EMAIL"
```

配置步骤：

1. 在 Cloudflare 中为自己的域名启用 Email Routing / Email Service。
2. 添加并验证目标收件邮箱。
3. 确认发件地址属于已经接入邮件服务的域名。
4. 在 CoolMonitor 通知设置中填写发件人和已验证的收件人。
5. 启用邮件通知，保存并发送测试。

Cloudflare 文档说明，未限制的 `send_email` 绑定只能发送到账号中已经验证的目标地址。建议生产环境在 `wrangler.toml` 中增加 `allowed_destination_addresses` 和 `allowed_sender_addresses` 限制。

如果暂时不用邮件，保持邮件开关关闭即可。

## 十、日志与隐私

监控日志可以保存完整请求头、请求体、响应头和响应正文。Cookie、Authorization、API Key 等内容可能因此进入 D1。

建议：

- 不要在公共演示实例中配置真实 Cookie 或 Token。
- 使用权限最小化的专用检测凭据。
- 在“监控日志 → 自动清理设置”中设置合理保留时间，默认 30 天。
- 删除监控目标时日志会保留，站点会标记为已删除；敏感日志需单独删除。
- 上传 GitHub 前不要导出生产 D1 数据到仓库目录。

## 十一、备份与恢复

导出远程 D1：

```bash
npx wrangler d1 export coolmonitor --remote --output=backup.sql
```

`backup.sql` 可能包含账号哈希、通知 Token、Cookie 和响应正文，不应提交 GitHub。

恢复到一个新数据库前，先修改 `wrangler.toml` 中的数据库 ID，再执行：

```bash
npx wrangler d1 execute coolmonitor --remote --file=./backup.sql
```

## 十二、更新部署

拉取新版本并重新部署：

```bash
git pull
npx wrangler deploy
```

当前 `schema.sql` 用于全新安装。已有数据库升级前请先导出备份，不要重复导入包含演示数据的初始化文件。

## 十三、常见问题

### 页面打开但 API 返回 404

确认 `wrangler.toml` 中存在：

```toml
[assets]
directory = "./static"
binding = "ASSETS"
```

然后重新部署。

### 登录后立即失效

确认已经设置生产环境 Secret：

```bash
npx wrangler secret list
```

列表中应包含 `JWT_SECRET`。

### 数据库报 `no such table`

确认初始化的是远程数据库：

```bash
npx wrangler d1 execute coolmonitor --remote --file=./schema.sql
```

### 定时任务没有运行

确认 Worker Triggers 中存在 Cron，并查看 Cloudflare Worker 日志：

```bash
npx wrangler tail
```

### TCP 检测失败

地址必须为 `主机:端口`，例如 `example.com:22`，不要添加 `http://` 或路径。

### 邮件发送失败

检查发件域名是否已接入 Email Service、收件地址是否已验证，以及绑定允许的发件人/收件人范围。

## 十四、上传 GitHub 前检查

```bash
git status
git diff
```

还应确认以下内容没有进入提交：

- `.dev.vars`、`.env`、`.wrangler/`
- D1 导出文件和本地 SQLite 文件
- Telegram Bot Token、Webhook、Cookie、Authorization 请求头
- 真实邮箱、域名、IP、数据库 ID

推荐在 GitHub 仓库中启用 Secret Scanning。公开发布前还应根据需要添加 `LICENSE`；许可证类型需要由项目作者自行选择。

## 数据库文件

唯一数据库初始化文件：[schema.sql](schema.sql)。请勿将生产数据库导出文件提交到仓库。
