# Cloudflare Workers + R2 部署修复指南

## 问题诊断

您遇到的 404 错误很可能是因为：
1. Cloudflare Worker 没有正确部署
2. 访问的不是 Cloudflare 域名，而是本地文件
3. R2 存储桶配置问题

## 正确的架构

```
用户设备 -> Cloudflare Worker 域名 -> Worker.js -> R2 存储
                                  ↓
                              静态文件 (package-system.html)
```

## 修复步骤

### 1. 登录 Cloudflare
```bash
wrangler login
```
按提示在浏览器中完成 OAuth 登录。

### 2. 检查配置文件
确认 `wrangler.toml` 配置正确：
```toml
name = "century-business-system"
main = "worker.js"
compatibility_date = "2025-09-04"

account_id = "23441d4f7734b84186c4c20ddefef8e7"
workers_dev = true

[assets]
directory = "."
binding = "ASSETS"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "century-business-system"
```

### 3. 创建 R2 存储桶
```bash
wrangler r2 bucket create century-business-system
```

### 4. 部署到 Cloudflare
```bash
wrangler deploy
```

部署成功后，您会得到类似这样的 URL：
`https://century-business-system.[your-subdomain].workers.dev`

### 5. 更新前端配置
在 `package-system.html` 中的 `getBaseURL()` 函数，将：
```javascript
const cloudflareWorkerUrl = 'https://century-business-system.xiaol-worker-subdomain.workers.dev';
```
替换为您实际的 Worker 域名。

### 6. 访问方式

**正确方式：**
```
https://your-worker-domain.workers.dev/package-system.html
```

**错误方式：**
- 直接打开本地HTML文件 (file://)
- 通过本地服务器访问 (http://localhost:3000)

## 验证部署

### 1. 测试 Worker API
```bash
curl https://your-worker-domain.workers.dev/api/health
```
应该返回：
```json
{"success":true,"service":"worker","time":"..."}
```

### 2. 测试 package-sync API
```bash
curl https://your-worker-domain.workers.dev/api/package-sync/database
```
应该返回：
```json
{"success":false,"data":null,"message":"暂无同步数据"}
```
（这是正常的，因为还没有数据）

### 3. 测试静态文件
访问：`https://your-worker-domain.workers.dev/package-system.html`

## 常见问题排查

### Q: 仍然返回 404
A: 
1. 确认 Worker 已正确部署
2. 确认通过 Worker 域名访问，而不是本地文件
3. 检查 R2 存储桶是否正确创建和绑定

### Q: R2 存储桶不可用
A:
1. 检查 `wrangler.toml` 中的 R2 绑定配置
2. 确认存储桶名称正确
3. 检查 Cloudflare 账户权限

### Q: CORS 错误
A: Worker 已配置 CORS 头，如果仍有问题，检查浏览器控制台的具体错误信息。

## 最终检查清单

- [ ] Cloudflare 账户已登录
- [ ] R2 存储桶已创建
- [ ] Worker 已成功部署
- [ ] 前端代码中的 Worker 域名已更新
- [ ] 通过 Worker 域名访问系统
- [ ] API 端点正常响应
- [ ] 同步功能正常工作

## 优势

使用这个架构的优势：
- ✅ 全球 CDN 加速
- ✅ 无服务器，无需维护
- ✅ 自动扩容
- ✅ 跨设备同步
- ✅ 高可用性
- ✅ 成本低廉
