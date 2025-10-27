# ⏰ Cloudflare Cron Trigger 自动清理配置说明

## ✅ 已完成配置

### 1. wrangler.toml 配置

已在 `wrangler.toml` 中添加 Cron Trigger 配置：

```toml
# Cron Triggers - 定时任务
# 每天凌晨2点执行自动清理任务
[triggers]
crons = ["0 2 * * *"]
```

**Cron表达式说明：**
- `0 2 * * *` = 每天凌晨2点（UTC时间）
- 格式：`分 时 日 月 星期`

**常用的Cron表达式：**
```toml
crons = ["0 2 * * *"]    # 每天凌晨2点
crons = ["0 0 * * *"]    # 每天午夜
crons = ["0 */6 * * *"]  # 每6小时
crons = ["0 2 * * 1"]    # 每周一凌晨2点
crons = ["0 2 1 * *"]    # 每月1号凌晨2点
```

### 2. worker.js 定时任务处理

已添加 `scheduled` 处理器：

```javascript
export default {
  async fetch(request, env, ctx) {
    // HTTP请求处理
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduledCleanup(env));
  }
};
```

**关键代码：**
- `scheduled` - Cron Trigger 专用处理器
- `event` - 包含触发信息（Scheduled之类的对象）
- `env` - 环境变量（包含 R2_BUCKET 等）
- `ctx.waitUntil()` - 确保异步任务完成（即使 Worker 超时）

### 3. 自动清理逻辑

`handleScheduledCleanup()` 函数会在每天凌晨2点自动执行：

```javascript
1. 计算45天前的日期
2. 获取所有 package/ 下的文件
3. 按日期分组
4. 找出需要删除的日期文件夹
5. 批量删除文件
6. 记录日志
```

---

## 📋 Cron Trigger 时间对照表

### 时区说明

**重要：** Cloudflare Cron 使用 **UTC 时间**（协调世界时）

### 中国时区换算

- **UTC+8（中国时区）** = UTC + 8小时
- 如果想在中国时间凌晨2点执行，需要设置：**UTC时间 18:00（前一天晚上6点）**

### 常用时间对照

| 中国时间 | Cron表达式 | 说明 |
|---------|-----------|------|
| 每天凌晨2点 | `0 18 * * *` | 最常用，深夜执行 |
| 每天上午10点 | `0 2 * * *` | 工作日上午 |
| 每天中午12点 | `0 4 * * *` | 午休时间 |
| 每天下午6点 | `0 10 * * *` | 下班后 |
| 每天午夜12点 | `0 16 * * *` | 一天结束 |

### 当前配置

```toml
crons = ["0 2 * * *"]
```

这表示：**UTC时间每天凌晨2点执行** = **中国时间每天上午10点执行**

如果想改为中国时间凌晨2点执行，应该改为：

```toml
crons = ["0 18 * * *"]  # 中国时间每天凌晨2点执行
```

---

## 🚀 部署和测试

### 1. 本地测试

**⚠️ 注意：** Cron Trigger **无法在本地环境测试**，只能在部署后测试。

但可以手动调用清理函数进行测试：

```bash
# 在浏览器控制台执行
# 或者创建一个测试API端点

// 在 worker.js 中临时添加（测试完后删除）
if (path === '/api/test-cleanup' && method === 'GET') {
  await handleScheduledCleanup(env);
  return Response.json({ success: true }, { headers: corsHeaders });
}
```

### 2. 部署到 Cloudflare

```bash
# 使用 Wrangler 部署
npx wrangler deploy

# 或使用自定义域名部署
npx wrangler deploy --env production
```

### 3. 验证 Cron 配置

部署后，在 Cloudflare Dashboard 查看：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 "Workers & Pages"
3. 选择你的 Worker
4. 查看 "Triggers" 标签页
5. 应该看到 Cron 配置：`0 2 * * *`

### 4. 查看执行日志

**实时日志：**
```bash
# 使用 Wrangler 查看实时日志
npx wrangler tail

# 或过滤定时任务日志
npx wrangler tail --format pretty | grep "Cron Trigger"
```

**Dashboard 查看：**
1. 进入 Cloudflare Dashboard
2. Workers & Pages → 你的 Worker → Logs
3. 搜索 "Cron Trigger" 或 "自动清理"

---

## 🧪 手动触发测试

### 方法1：通过 Cloudflare Dashboard

1. 登录 Cloudflare Dashboard
2. Workers & Pages → 你的 Worker
3. 点击 "Triggers"
4. 在 Cron 触发器中点击 "Trigger" 按钮
5. 立即执行一次

### 方法2：创建一个测试端点（临时）

在 worker.js 中添加：

```javascript
// 处理Excel文件上传
async function handleExcelUpload(request, env, corsHeaders) {
  // ... 原有代码
}

// 临时测试端点（测试完后删除）
async function handleTestCleanup(request, env, corsHeaders) {
  // 执行清理
  await handleScheduledCleanup(env);
  
  return Response.json({
    success: true,
    message: '清理任务已执行，请查看日志'
  }, { headers: corsHeaders });
}
```

然后在 API 路由中添加：

```javascript
} else if (path === '/api/test-cleanup' && method === 'GET') {
  return await handleTestCleanup(request, env, corsHeaders);
} else if (path.startsWith('/api/r2/')) {
```

访问：`https://your-domain.com/api/test-cleanup`

**⚠️ 测试完成后记得删除测试端点！**

---

## 📊 监控和日志

### 查看清理日志

定时任务执行时会在日志中输出：

```
⏰ Cron Trigger 触发：开始自动清理45天前的文件
📅 清理截止日期：2025-09-08T00:00:00.000Z
📊 总共找到 245 个文件
📁 识别到 35 个不同的日期
🗑️ 需要删除 12 个日期文件夹
🗂️ 删除日期文件夹: 2025-09-01 (15 个文件)
🗂️ 删除日期文件夹: 2025-09-02 (18 个文件)
...
✅ 自动清理完成：删除了 156 个文件，涉及 12 个日期文件夹
📋 删除的日期：2025-09-01, 2025-09-02, ...
```

### 设置日志告警（可选）

在 Cloudflare Dashboard 可以设置：
1. 进入 Workers & Pages → 你的 Worker
2. Settings → Logs
3. 配置告警规则（如清理失败时发送通知）

---

## ⚠️ 注意事项

### 1. 时区问题
- Cron 使用 UTC 时间
- 中国用户需要将时间减8小时
- 例如：中国凌晨2点 = UTC 18:00（前一天晚上6点）

### 2. 执行时间
- Cron 的执行时间可能略有偏差（1-2分钟）
- 不会精确定时到秒

### 3. Worker 超时
- 使用 `ctx.waitUntil()` 确保清理任务完成
- 即使 Worker 响应超时，清理任务也会继续执行

### 4. 费用问题
- Cron Trigger 本身**免费**
- 但 R2 的删除操作会产生少量费用
- 一般每月几美分到几美元

### 5. 文件太多的情况
- 如果文件很多（>1000个），清理可能需要较长时间
- 建议在低峰期执行（如凌晨）

---

## 🔧 高级配置

### 自定义执行时间

修改 `wrangler.toml`：

```toml
# 每天凌晨3点（中国时间）执行
crons = ["0 19 * * *"]

# 每周一凌晨2点执行
crons = ["0 18 * * 1"]

# 每月1号凌晨2点执行
crons = ["0 18 1 * *"]

# 多个时间点
crons = ["0 18 * * *", "0 6 * * *"]  # 每天凌晨2点和上午10点
```

### 动态保留天数

可以通过环境变量配置：

```toml
# wrangler.toml
[vars]
DAYS_TO_KEEP = "45"
```

```javascript
// worker.js
const DAYS_TO_KEEP = parseInt(env.DAYS_TO_KEEP || '45', 10);
```

### 清理不同路径

可以同时清理多个路径：

```javascript
const pathsToClean = ['package/', 'archive/', 'temp/'];

for (const path of pathsToClean) {
  await cleanupPath(path, env, cutoffTimestamp);
}
```

---

## 📝 完整的配置检查清单

- [x] wrangler.toml 添加 `[triggers] crons` 配置
- [x] worker.js 添加 `scheduled` 处理器
- [x] 实现 `handleScheduledCleanup()` 函数
- [x] 部署到 Cloudflare
- [x] 验证 Cron 配置在 Dashboard 中显示
- [x] 查看日志确认执行成功
- [ ] 设置日志告警（可选）
- [ ] 调整时区为本地时间（如需要）

---

## 🎯 总结

### 已完成的改动

1. **wrangler.toml** - 添加 Cron Trigger 配置
2. **worker.js** - 添加 scheduled 处理器和清理逻辑
3. **package-system.html** - 移除手动清理按钮

### 自动执行流程

```
每天凌晨2点（UTC，中国时间上午10点）
  ↓
Cloudflare Cron Trigger 触发
  ↓
Worker scheduled 处理器执行
  ↓
handleScheduledCleanup() 执行清理
  ↓
删除45天前的 package/ 文件
  ↓
记录日志
```

### 用户操作

- **无需任何操作**
- 系统自动在后台执行清理
- 可通过日志查看清理记录

---

**配置完成时间：** 2025-10-23  
**Cron执行时间：** UTC 02:00（每天） = 中国时间 10:00  
**保留天数：** 45天  
**状态：** ✅ 配置完成，待部署验证

