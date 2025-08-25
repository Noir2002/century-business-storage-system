# 🚀 数据管理系统后端快速启动

## 📋 准备工作

### 1. 安装Node.js
确保你的电脑已安装Node.js（版本16+）
- 下载地址：https://nodejs.org/
- 验证安装：`node --version`

### 2. 安装依赖
在项目根目录运行：
```bash
npm install
```

## 🎯 启动系统

### 步骤1：启动后端服务器
```bash
npm start
```

你会看到：
```
📊 数据管理系统后端服务器启动成功!
🚀 服务地址: http://localhost:3000
📁 文件存储目录: /path/to/layui/data/uploads
💾 数据文件目录: /path/to/layui/data
```

### 步骤2：访问系统
在浏览器打开：`http://localhost:3000`

现在你的系统有了**真实的数据存储能力**！

## 🔧 系统架构

```
layui/
├── 前端文件 (现有的HTML/CSS/JS)
├── server.js          # 后端服务器
├── package.json       # 项目配置
├── data/              # 数据存储（自动创建）
│   ├── users.json     # 用户数据
│   ├── files.json     # 文件信息
│   └── uploads/       # Excel文件存储
└── storage-upgrade-plan.md  # 升级方案
```

## 🔑 默认用户账户
- **管理员**: admin / 123456
- **分析员**: analyst / 123456

## 📡 API接口

### 认证接口
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/profile` - 获取用户信息

### 文件管理
- `POST /api/files/upload` - 上传Excel文件
- `GET /api/files` - 获取文件列表
- `GET /api/files/:id/download` - 下载文件
- `GET /api/files/:id/analyze` - 分析Excel数据
- `DELETE /api/files/:id` - 删除文件

### 系统监控
- `GET /api/health` - 健康检查

## 🧪 测试文件上传

1. 登录系统
2. 准备一个Excel文件
3. 访问"数据导入"页面
4. 上传文件并查看分析结果

## 🔄 开发模式

如果要修改代码，使用开发模式：
```bash
npm run dev
```
这会在代码更改时自动重启服务器。

## 📊 数据存储位置

- **用户数据**: `data/users.json`
- **文件信息**: `data/files.json`  
- **Excel文件**: `data/uploads/`

## 🛡️ 安全特性

- ✅ JWT令牌认证
- ✅ 文件类型验证
- ✅ 文件大小限制（50MB）
- ✅ 用户权限控制
- ✅ 密码加密存储

## 🚨 故障排除

### 端口冲突
如果3000端口被占用，修改`server.js`中的PORT变量：
```javascript
const PORT = 3001; // 改为其他端口
```

### 文件权限问题
确保Node.js有权限创建`data`目录和写入文件。

### 依赖安装失败
删除`node_modules`目录和`package-lock.json`，重新运行：
```bash
rm -rf node_modules package-lock.json
npm install
```

## 📈 下一步功能扩展

1. **数据可视化**: 集成ECharts生成图表
2. **Excel编辑**: 在线修改Excel内容
3. **数据库升级**: 迁移到MySQL/PostgreSQL
4. **批量操作**: 支持多文件批处理
5. **API文档**: 生成Swagger文档

## 💬 需要帮助？

如果遇到问题，请查看：
1. 控制台错误信息
2. 浏览器网络请求状态
3. `data`目录是否正确创建

现在你有了真正的企业级数据管理系统！🎉 