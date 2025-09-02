# Century Business 系统整合项目 - 对话上下文

## 项目概述
- **目标**: 将视频存储系统和库存管理系统整合到一个域名下
- **域名**: centurybusiness.org (已购买)
- **技术栈**: Cloudflare Pages + Cloudflare R2 + GitHub

## 当前进度

### ✅ 已完成
1. **域名购买**: centurybusiness.org
2. **代码整合**: 创建了统一的仪表板界面
3. **配置文件**: 创建了cloudflare-config.js和cloudflare-storage.js
4. **迁移策略**: 确定了从file-storage仓库迁移到century-business-storage-system仓库的方案

### 🔄 正在进行
1. **代码迁移**: 将视频存储系统代码迁移到库存管理系统仓库
2. **Cloudflare Pages设置**: 由于原仓库文件太大导致失败，正在使用清理后的仓库重新设置

### 📋 待完成
1. **域名DNS配置**: 将centurybusiness.org的DNS指向Cloudflare
2. **Cloudflare R2设置**: 配置存储桶和API密钥
3. **文件迁移**: 将现有视频文件夹上传到R2存储
4. **系统测试**: 测试整合后的系统功能
5. **自动清理**: 实现30天文件自动清理功能

## 文件结构计划

### 目标仓库结构 (century-business-storage-system)
```
├── index.html (统一入口页面)
├── video-storage.html (视频存储模块)
├── dashboard.html (库存管理仪表板)
├── shared-assets/
│   ├── cloudflare-config.js
│   ├── cloudflare-storage.js
│   └── common-styles.css
├── data/
│   ├── database.json
│   └── files-registry.json
└── docs/
    └── conversation-context.md
```

### Cloudflare配置
- **Pages**: 托管Web应用
- **R2 Storage**: 存储视频和Excel文件
- **自定义域名**: 
  - 主站: centurybusiness.org
  - 文件CDN: files.centurybusiness.org

## 关键技术决策

1. **存储方案**: 从GitHub LFS迁移到Cloudflare R2
   - 优势: 无流量费用、更高的文件大小限制、更好的性能
   
2. **架构模式**: 单页应用 + 模块化设计
   - 统一的导航和认证
   - 模块间数据共享
   
3. **自动清理**: 30天文件生命周期
   - 减少存储成本
   - 配合手动本地备份流程

## 下一步操作指南

### 在新Cursor窗口中继续:
1. 打开century-business-storage-system项目
2. 参考这个上下文文档
3. 继续实施迁移计划

### 关键命令和配置
```bash
# Cloudflare CLI
npm install -g wrangler
wrangler login
wrangler r2 bucket create cb-file-storage

# Git操作
git add .
git commit -m "Integrate video storage system"
git push origin main
```

## 重要提醒
- 保存好Cloudflare API Token
- DNS生效需要24-48小时
- 先测试后生产部署
- 备份现有数据

## 联系信息
- 项目仓库: https://github.com/Noir2002/century-business-storage-system
- 域名注册商: Spaceship
- 云服务: Cloudflare (免费计划)
