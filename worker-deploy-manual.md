# 手动部署Workers指南

由于API Token权限限制，我们可以手动在Cloudflare仪表板中部署Workers：

## 📋 手动部署步骤

### 1. 访问Workers仪表板
- 访问: https://dash.cloudflare.com/
- 点击左侧菜单中的 "Workers & Pages"
- 点击 "Create" -> "Create Worker"

### 2. 创建新Worker
- Worker名称: `century-business-api`
- 点击 "Deploy"

### 3. 复制Worker代码
将 `worker.js` 文件的全部内容复制粘贴到Worker编辑器中

### 4. 配置环境变量
在Worker设置中添加：
- `CLOUDFLARE_API_TOKEN`: fysQ3WfSzf6LLArZpQ5ifp8YpicsIiX-u3eQ_1mJ
- `CLOUDFLARE_ACCOUNT_ID`: 23441d4f7734b84186c4c20ddefef8e7

### 5. 绑定R2存储桶
在Worker设置中的"Variables and Secrets"部分：
- 添加R2 bucket binding
- Variable name: `R2_BUCKET`
- R2 bucket: `century-business-system`

### 6. 测试部署
部署完成后，Worker会获得一个URL，类似：
`https://century-business-api.YOUR_SUBDOMAIN.workers.dev`

测试健康检查：
`https://century-business-api.YOUR_SUBDOMAIN.workers.dev/api/health`

## 🔄 获取Worker URL后的步骤

1. 复制Worker的完整URL
2. 更新前端 `api-config.js` 中的baseURL
3. 提交更改到GitHub，触发Pages重新部署
4. 测试完整功能

## 📋 Worker代码内容

请将以下代码复制到Worker编辑器中：

```javascript
[这里是worker.js的全部内容]
```
