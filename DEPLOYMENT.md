# Century Business System 部署指南

## 🚀 当前状态
- ✅ 前端已部署到 Cloudflare Pages
- ⏳ 后端需要部署到 Cloudflare Workers

## 📋 部署步骤

### 1. 安装 Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### 2. 创建 KV 命名空间
```bash
# 创建开发环境 KV
wrangler kv:namespace create "DATA_KV"

# 创建生产环境 KV
wrangler kv:namespace create "DATA_KV" --env production
```

### 3. 更新 wrangler.toml
将步骤2返回的KV namespace ID填入 `wrangler.toml` 文件中的相应位置。

### 4. 部署 Workers
```bash
# 部署到开发环境
wrangler deploy

# 部署到生产环境
wrangler deploy --env production
```

### 5. 更新前端API配置
部署完成后，更新 `api-config.js` 中的 Workers URL：
```javascript
this.baseURL = 'https://century-business-api.YOUR_SUBDOMAIN.workers.dev';
```

### 6. 重新部署 Pages
提交代码更改到 GitHub，触发 Pages 自动部署。

## 🔧 环境变量

需要在 Cloudflare Workers 中设置的环境变量：
- `CLOUDFLARE_API_TOKEN`: 您的 API Token
- `CLOUDFLARE_ACCOUNT_ID`: 您的 Account ID

## 📊 数据存储

- **KV Store**: 用于存储用户数据、表格数据
- **R2 Storage**: 用于存储文件上传

## 🧪 测试

部署完成后，访问：
- **前端**: https://centurybusiness.org
- **API健康检查**: https://century-business-api.YOUR_SUBDOMAIN.workers.dev/api/health

## ⚠️ 注意事项

1. KV 存储有读写限制，注意不要频繁操作
2. Workers 有 CPU 时间限制，复杂计算可能需要优化
3. R2 存储需要正确的 CORS 配置

## 🔄 后续优化

1. 实现数据库备份机制
2. 添加更多的错误处理
3. 优化 Workers 性能
4. 实现用户认证中间件
