<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# 终极解决方案：使用 Cloudflare Worker 全权托管静态站点与 API

为了彻底避免 Pages 路由冲突和二次域名配置问题，建议将前端静态资源和后端 API 都集成到同一个 Cloudflare Worker 中，通过 **Worker Sites** 功能一并部署。这样所有对 `centurybusiness.org` 的请求，无论是静态页面还是 `/api/*`，都由同一个 Worker 处理，无需再借助 Pages 自定义域或分子域。

***

## 1. 安装并初始化 Wrangler

确保本地已安装 Wrangler（Cloudflare 的 CLI 工具）：

```bash
npm install -g wrangler
```

在项目根目录执行：

```bash
wrangler init --site
```

选择“已有项目”并填写如下示例配置，当提示时，指定 `dist/`（或您静态构建输出目录）为站点根。

***

## 2. 配置 `wrangler.toml`

编辑项目根目录下的 `wrangler.toml`，示例如下：

```toml
name = "century-business-system"
main = "worker.js"          # 您已有的 worker.js
compatibility_date = "2025-09-04"

account_id = "<您的 Cloudflare 账号 ID>"
workers_dev = false
route = "centurybusiness.org/*"     # 绑定自定义域
zone_id = "<centurybusiness.org 的 Zone ID>"

# 静态资源目录
[site]
bucket = "./dist"           # Pages 构建后输出目录
entry-point = "."           # worker.js 所在路径

# R2 绑定
[[r2_buckets]]
binding = "R2_BUCKET"       
bucket_name = "century-business-system"
preview_bucket_name = "century-business-system"
```

- `route` 和 `zone_id` 绑定您的自定义域
- `[site]` 段配置静态资源目录
- `[[r2_buckets]]` 继续沿用您原先的 R2 绑定

***

## 3. 合并 `worker.js` 逻辑

在 `worker.js` 中，在最顶层添加静态资源处理逻辑，将 `/api/` 开头的请求路由到原有的 API 处理函数，其余请求交给 Sites 服务器。例如：

```javascript
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';  // 若使用 KV
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // 所有 /api/ 路由走现有 API 处理
      return handleRequest(request, env, ctx);
    }
    // 其他路径渲染静态页面
    try {
      return await getAssetFromKV(event, { cacheControl: { bypassCache: true } });
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
  }
};
```

将您原先的所有 `handle*` API 路由函数（如 `handleLocalDB`、`handleExcelUpload` 等）都置于 `handleRequest` 内部路由分发。

***

## 4. 构建静态资源

确保您的前端构建命令产出到 `dist/`（与 `wrangler.toml` 中 `bucket` 路径一致）。例如：

```bash
npm run build      # 生成 dist/ 目录
```


***

## 5. 发布到自定义域

在项目根目录运行：

```bash
wrangler publish
```

Wrangler 会将静态资源上传到 Workers Site，并部署 Worker 代码到 `centurybusiness.org/*` 路由。

***

## 6. 验证

1. 访问 `https://centurybusiness.org/`，应正常加载您的前端界面。
2. 访问 `https://centurybusiness.org/api/localdb/wide/clear-all`，应返回：

```json
{ "success": true, "message": "成功清空所有宽表数据" }
```

3. 其他 `/api/*` 路由也会由 Worker 处理，不再出现 404。

***

**优势：**

- **单一入口**：静态和 API 全部由同一 Worker 处理，无需多套域名或路由配置
- **自定义域绑定**：`centurybusiness.org` 直接指向 Worker，无需再在 Pages 下拆分
- **高可用**：借助 Cloudflare Edge 网络，静态缓存与 API 延迟都更低

按照以上步骤重写并部署，即可彻底解决您遇到的 404、路由冲突及自定义域问题。

