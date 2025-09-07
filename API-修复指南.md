# 🔧 API 404问题修复指南

## 📋 问题诊断结果

### 🎯 主要问题
1. **Worker名称不匹配**: API配置指向错误的Worker URL
2. **域名路由配置错误**: `wrangler.toml`中zone_id填写了域名而不是Zone ID
3. **静态资源与API路由冲突**: 可能存在路由优先级问题

### 🔍 具体问题分析
- **前端API配置**: 指向 `century-business-api.anthonin815.workers.dev`
- **实际Worker名称**: `century-business-system` (根据wrangler.toml)
- **正确URL应该是**: `https://century-business-system.anthonin815.workers.dev`

## 🛠️ 解决步骤

### 第一步：修复配置文件
✅ **已完成**: 
- 修复了 `wrangler.toml` 启用workers_dev
- 修复了 `api-config.js` 中的Worker URL

### 第二步：部署Worker
```bash
# 运行部署脚本
./deploy-worker.bat

# 或手动部署
wrangler login
wrangler deploy
```

### 第三步：验证部署
测试以下URL:
- 健康检查: `https://century-business-system.anthonin815.workers.dev/api/health`
- 文件列表: `https://century-business-system.anthonin815.workers.dev/api/files`

### 第四步：获取正确的Zone ID（可选）
如果需要自定义域名，获取真正的Zone ID:
1. 登录Cloudflare仪表板
2. 选择您的域名
3. 右侧边栏找到Zone ID（格式类似：a1b2c3d4e5f6...）

## 🧪 测试API端点

### 使用PowerShell测试
```powershell
# 测试健康检查
Invoke-RestMethod -Uri "https://century-business-system.anthonin815.workers.dev/api/health"

# 测试文件列表
Invoke-RestMethod -Uri "https://century-business-system.anthonin815.workers.dev/api/files"
```

### 使用浏览器测试
直接访问以下URL查看JSON响应:
- https://century-business-system.anthonin815.workers.dev/api/health
- https://century-business-system.anthonin815.workers.dev/api/files

## 🔄 如果问题仍然存在

### 检查清单
1. **Worker是否成功部署**
   - 访问Cloudflare仪表板 → Workers & Pages
   - 确认`century-business-system`存在且状态正常

2. **R2存储桶绑定是否正确**
   - 在Worker设置中检查R2_BUCKET绑定
   - 确认指向`century-business-system`存储桶

3. **环境变量是否设置**
   - CLOUDFLARE_API_TOKEN (如果需要)
   - CLOUDFLARE_ACCOUNT_ID (如果需要)

4. **前端缓存问题**
   - 清除浏览器缓存
   - 强制刷新页面 (Ctrl+F5)

## 📊 预期结果

修复完成后，您的Excel相关功能应该能正常工作:
- ✅ 文件上传到R2存储
- ✅ 文件列表显示
- ✅ Excel数据解析
- ✅ 库存管理功能
- ✅ 数据分析功能

## 🆘 如需帮助

如果按照此指南操作后问题仍未解决，请提供:
1. Wrangler部署的输出日志
2. 浏览器开发者工具中的网络错误
3. Worker日志（在Cloudflare仪表板中查看）
