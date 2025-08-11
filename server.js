const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const XLSX = require('xlsx');
const https = require('https');
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-secret-key-change-in-production';

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 服务前端文件

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
fs.ensureDirSync(dataDir);
fs.ensureDirSync(uploadsDir);

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB限制
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传Excel文件 (.xlsx, .xls, .csv)'));
    }
  }
});

// 数据文件路径
const usersFile = path.join(dataDir, 'users.json');
const filesFile = path.join(dataDir, 'files.json');
const localDbFile = path.join(dataDir, 'local-database.json');
const wideTableFile = path.join(dataDir, 'wide-table.json');
const recordsFile = path.join(dataDir, 'records.json');
const tmallOrdersFile = path.join(dataDir, 'tmall-orders.json');

// 初始化数据文件
function initDataFiles() {
  if (!fs.existsSync(usersFile)) {
    const defaultUsers = [
      {
        id: 1,
        username: 'admin',
        password: bcrypt.hashSync('123456', 10),
        role: 'admin',
        realname: '系统管理员',
        email: 'admin@example.com',
        createTime: new Date().toISOString()
      },
      {
        id: 2,
        username: 'editor1',
        password: bcrypt.hashSync('123456', 10),
        role: 'admin', // 小团队编辑者给管理员权限
        realname: '编辑员工1',
        email: 'editor1@example.com',
        createTime: new Date().toISOString()
      },
      {
        id: 3,
        username: 'editor2',
        password: bcrypt.hashSync('123456', 10),
        role: 'admin', // 小团队编辑者给管理员权限
        realname: '编辑员工2',
        email: 'editor2@example.com',
        createTime: new Date().toISOString()
      },
      {
        id: 4,
        username: 'viewer',
        password: bcrypt.hashSync('123456', 10),
        role: 'analyst', // 查看者角色
        realname: '查看员工',
        email: 'viewer@example.com',
        createTime: new Date().toISOString()
      },
      {
        id: 5,
        username: 'analyst',
        password: bcrypt.hashSync('123456', 10),
        role: 'analyst', // 数据分析员角色
        realname: '数据分析员',
        email: 'analyst@example.com',
        createTime: new Date().toISOString()
      }
    ];
    fs.writeJsonSync(usersFile, defaultUsers);
  }

  if (!fs.existsSync(filesFile)) {
    fs.writeJsonSync(filesFile, []);
  }

  if (!fs.existsSync(localDbFile)) {
    fs.writeJsonSync(localDbFile, []);
  }

  if (!fs.existsSync(wideTableFile)) {
    fs.writeJsonSync(wideTableFile, []);
  }

  if (!fs.existsSync(recordsFile)) {
    fs.writeJsonSync(recordsFile, []);
  }
}

// 读取数据
function readUsers() {
  return fs.readJsonSync(usersFile);
}

function readFiles() {
  return fs.readJsonSync(filesFile);
}

function writeFiles(files) {
  fs.writeJsonSync(filesFile, files);
}

function readLocalDb() {
  return fs.readJsonSync(localDbFile);
}

function writeLocalDb(data) {
  fs.writeJsonSync(localDbFile, data);
}

function readWideTable() {
  return fs.readJsonSync(wideTableFile);
}

function writeWideTable(data) {
  fs.writeJsonSync(wideTableFile, data);
}

function readRecords() {
  return fs.readJsonSync(recordsFile);
}

function writeRecords(data) {
  fs.writeJsonSync(recordsFile, data);
}

function readTmallOrders() {
  if (!fs.existsSync(tmallOrdersFile)) return [];
  return fs.readJsonSync(tmallOrdersFile);
}
function writeTmallOrders(data) {
  fs.writeJsonSync(tmallOrdersFile, data);
}

// JWT验证中间件
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '需要登录' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '令牌无效' });
    }
    req.user = user;
    next();
  });
}

// API路由

// 用户登录
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password, role } = req.body;
    const users = readUsers();
    
    const user = users.find(u => 
      u.username === username && 
      u.role === role &&
      bcrypt.compareSync(password, u.password)
    );

    if (!user) {
      return res.status(401).json({ error: '用户名、密码或角色不正确' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        realname: user.realname,
        email: user.email,
        role: user.role,
        roleName: user.role === 'admin' ? '超级管理员' : '数据分析员'
      }
    });
  } catch (error) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取用户信息
app.get('/api/auth/profile', authenticateToken, (req, res) => {
  try {
    const users = readUsers();
    const user = users.find(u => u.id === req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({
      id: user.id,
      username: user.username,
      realname: user.realname,
      email: user.email,
      role: user.role,
      roleName: user.role === 'admin' ? '超级管理员' : '数据分析员'
    });
  } catch (error) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 文件上传
app.post('/api/files/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    // 读取Excel文件基本信息，使用更强健的读取方式
    const workbook = XLSX.readFile(req.file.path, {
      cellText: false,
      cellDates: true,
      sheetStubs: true,  // 包含空工作表
      bookSheets: true,  // 强制读取所有工作表
      bookProps: true    // 读取工作簿属性
    });
    const sheetNames = workbook.SheetNames;
    
    // 确保第一个工作表存在
    let firstSheet = null;
    let rowCount = 0;
    let colCount = 0;
    
    for (let sheetName of sheetNames) {
      if (workbook.Sheets[sheetName]) {
        firstSheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1:A1');
        rowCount = range.e.r + 1;
        colCount = range.e.c + 1;
        break;
      }
    }
    
    console.log('上传时发现的工作表:', {
      总数: sheetNames.length,
      名称列表: sheetNames,
      实际加载的工作表: Object.keys(workbook.Sheets)
    });

    const fileInfo = {
      id: Date.now(),
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      uploadTime: new Date().toISOString(),
      uploadedBy: req.user.username,
      userId: req.user.id,
      sheetNames: sheetNames,
      rowCount: rowCount,
      colCount: colCount,
      description: req.body.description || ''
    };

    const files = readFiles();
    files.push(fileInfo);
    writeFiles(files);

    res.json({
      success: true,
      message: '文件上传成功',
      file: fileInfo
    });
  } catch (error) {
    console.error('文件上传错误:', error);
    res.status(500).json({ error: '文件处理失败' });
  }
});

// 获取文件列表
app.get('/api/files', authenticateToken, (req, res) => {
  try {
    const files = readFiles();
    
    // 根据角色过滤文件
    let userFiles = files;
    if (req.user.role !== 'admin') {
      userFiles = files.filter(f => f.userId === req.user.id);
    }

    res.json({
      success: true,
      files: userFiles.map(f => ({
        id: f.id,
        originalName: f.originalName,
        size: f.size,
        uploadTime: f.uploadTime,
        uploadedBy: f.uploadedBy,
        sheetNames: f.sheetNames,
        rowCount: f.rowCount,
        colCount: f.colCount,
        description: f.description
      }))
    });
  } catch (error) {
    res.status(500).json({ error: '获取文件列表失败' });
  }
});

// 下载文件
app.get('/api/files/:id/download', authenticateToken, (req, res) => {
  try {
    const files = readFiles();
    const file = files.find(f => f.id == req.params.id);

    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 检查权限
    if (req.user.role !== 'admin' && file.userId !== req.user.id) {
      return res.status(403).json({ error: '没有访问权限' });
    }

    const filePath = path.join(uploadsDir, file.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件已删除' });
    }

    res.download(filePath, file.originalName);
  } catch (error) {
    res.status(500).json({ error: '下载失败' });
  }
});

// 分析Excel数据（支持分页和工作表选择）
app.get('/api/files/:id/analyze', authenticateToken, (req, res) => {
  try {
    const files = readFiles();
    const file = files.find(f => f.id == req.params.id);

    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 检查权限
    if (req.user.role !== 'admin' && file.userId !== req.user.id) {
      return res.status(403).json({ error: '没有访问权限' });
    }

    const filePath = path.join(uploadsDir, file.filename);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    console.log('文件信息:', {
      路径: filePath,
      大小: fs.statSync(filePath).size,
      存在: fs.existsSync(filePath)
    });
    
    let workbook;
    try {
      // 尝试最简单的读取方式
      console.log('尝试基础读取...');
      workbook = XLSX.readFile(filePath);
      console.log('基础读取成功，工作表数量:', workbook.SheetNames.length);
      console.log('基础读取后的Sheets对象:', workbook.Sheets ? '存在' : '不存在');
      
      if (!workbook.Sheets || Object.keys(workbook.Sheets).length === 0) {
        console.log('基础读取失败，尝试其他选项...');
        
                 // 尝试不同的选项组合
         const readOptions = [
           { cellText: true, cellDates: false },
           { raw: true },
           { bookSheets: true, bookProps: true },
           { type: 'buffer' },
           { type: 'binary' }
         ];
         
         for (let i = 0; i < readOptions.length; i++) {
           try {
             console.log(`尝试选项 ${i + 1}:`, readOptions[i]);
             workbook = XLSX.readFile(filePath, readOptions[i]);
             if (workbook.Sheets && Object.keys(workbook.Sheets).length > 0) {
               console.log(`选项 ${i + 1} 成功! 加载了 ${Object.keys(workbook.Sheets).length} 个工作表`);
               break;
             }
           } catch (err) {
             console.log(`选项 ${i + 1} 失败:`, err.message);
           }
         }
         
         // 如果还是失败，尝试读取文件为buffer然后解析
         if (!workbook.Sheets || Object.keys(workbook.Sheets).length === 0) {
           console.log('尝试读取文件为buffer...');
           try {
             const fileBuffer = fs.readFileSync(filePath);
             console.log('文件buffer大小:', fileBuffer.length);
             workbook = XLSX.read(fileBuffer, { type: 'buffer' });
             if (workbook.Sheets && Object.keys(workbook.Sheets).length > 0) {
               console.log('Buffer方式成功! 加载了', Object.keys(workbook.Sheets).length, '个工作表');
             }
           } catch (bufferError) {
             console.log('Buffer方式也失败:', bufferError.message);
           }
         }
      }
      
    } catch (readError) {
      console.error('所有读取方式都失败:', readError);
      return res.status(500).json({ error: '文件读取失败: ' + readError.message });
    }
    
    console.log('分析时的工作表信息:', {
      总工作表数: workbook.SheetNames.length,
      工作表名称: workbook.SheetNames,
      实际加载的工作表数: workbook.Sheets ? Object.keys(workbook.Sheets).length : 0,
      实际加载的工作表键: workbook.Sheets ? Object.keys(workbook.Sheets) : []
    });
    
            // 最终检查
    if (!workbook || !workbook.Sheets || Object.keys(workbook.Sheets).length === 0) {
      console.error('所有读取方式都无法加载工作表');
      return res.status(500).json({ 
        error: '文件解析失败，可能是文件格式不支持或文件损坏',
        sheetNames: workbook ? workbook.SheetNames : [],
        loadedSheets: workbook && workbook.Sheets ? Object.keys(workbook.Sheets) : []
      });
    }
    
    console.log('最终成功加载的工作表:', Object.keys(workbook.Sheets));
    
    // 获取参数
    let targetSheetName = req.query.sheet || workbook.SheetNames[0];
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // 默认每页20行
    
    console.log(`开始处理工作表: ${targetSheetName}, 第${page}页`);
    const startTime = Date.now();
    
    console.log('原始请求的工作表名称:', JSON.stringify(targetSheetName));
    console.log('可用的工作表:', workbook.SheetNames.map(name => JSON.stringify(name)));
    
    // 调试：输出工作表对象的所有键
    console.log('工作表对象的实际键:', workbook.Sheets ? Object.keys(workbook.Sheets).map(key => JSON.stringify(key)) : []);
    
    // URL解码工作表名称
    try {
      targetSheetName = decodeURIComponent(targetSheetName);
      console.log('URL解码后的工作表名称:', JSON.stringify(targetSheetName));
    } catch (e) {
      console.log('URL解码失败，使用原始名称');
    }
    
    // 直接查找工作表
    let worksheet = workbook.Sheets[targetSheetName];
    console.log('直接查找结果:', worksheet ? '找到' : '未找到');
    
    if (!worksheet) {
      console.log('精确匹配失败，尝试模糊匹配...');
      // 尝试找到最接近的工作表名称
      const matchedSheet = workbook.SheetNames.find(sheetName => {
        console.log('比较:', JSON.stringify(sheetName), 'vs', JSON.stringify(targetSheetName));
        return sheetName === targetSheetName ||
               sheetName.trim() === targetSheetName.trim() ||
               sheetName.replace(/\s+/g, '') === targetSheetName.replace(/\s+/g, '') ||
               sheetName.includes(targetSheetName) ||
               targetSheetName.includes(sheetName);
      });
      
      if (matchedSheet) {
        console.log('找到匹配的工作表:', JSON.stringify(matchedSheet));
        targetSheetName = matchedSheet;
        worksheet = workbook.Sheets[matchedSheet]; // 直接使用找到的键名
        console.log('使用匹配键名查找结果:', worksheet ? '找到' : '未找到');
      }
      
      // 如果模糊匹配也失败，尝试直接从工作表对象的键中查找
      if (!worksheet) {
        console.log('模糊匹配也失败，尝试从对象键中查找...');
        const actualKey = workbook.Sheets ? Object.keys(workbook.Sheets).find(key => {
          console.log('对象键比较:', JSON.stringify(key), 'vs', JSON.stringify(targetSheetName));
          return key === targetSheetName ||
                 key.trim() === targetSheetName.trim() ||
                 key.replace(/\s+/g, '') === targetSheetName.replace(/\s+/g, '') ||
                 key.includes(targetSheetName) ||
                 targetSheetName.includes(key);
        }) : null;
        
        if (actualKey) {
          console.log('在对象键中找到匹配:', JSON.stringify(actualKey));
          targetSheetName = actualKey;
          worksheet = workbook.Sheets[actualKey];
          console.log('使用对象键查找结果:', worksheet ? '找到' : '未找到');
        }
      }
    }
    
    if (!worksheet) {
      console.log('工作表完全不存在，使用第一个工作表');
      targetSheetName = workbook.SheetNames[0];
      worksheet = workbook.Sheets[targetSheetName];
      console.log('使用默认工作表:', JSON.stringify(targetSheetName));
    } else {
      console.log('成功找到工作表:', JSON.stringify(targetSheetName));
    }

    // 优化的数据读取，限制范围避免读取过多无用数据
    let data, headers, allDataRows;
    try {
      console.log('开始读取工作表数据...');
      
      // 获取工作表范围
      const range = worksheet['!ref'];
      console.log('工作表范围:', range);
      
      // 限制读取范围，避免处理过多列（最多读取前100列）
      let readOptions = { 
        header: 1,
        defval: '', 
        blankrows: false,
        raw: false
      };
      
      // 如果范围太大，限制读取范围
      if (range) {
        const rangeObj = XLSX.utils.decode_range(range);
        const totalCols = rangeObj.e.c + 1;
        const totalRows = rangeObj.e.r + 1;
        console.log('原始数据范围: 行数', totalRows, '列数', totalCols);
        
        // 限制列数，避免读取过多无用列
        if (totalCols > 100) {
          console.log('列数过多，限制读取前100列');
          readOptions.range = {
            s: { c: 0, r: 0 },
            e: { c: 99, r: rangeObj.e.r }
          };
        }
      }
      
      data = XLSX.utils.sheet_to_json(worksheet, readOptions);
      console.log('实际读取数据行数:', data.length);

      // 处理数据
      headers = data[0] || [];
      allDataRows = data.slice(1).filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined));
      console.log('有效数据行数:', allDataRows.length);
      console.log('实际列数:', headers.length);
      
      // 如果数据行数为0，尝试更宽松的读取方式
      if (allDataRows.length === 0 && data.length > 1) {
        console.log('尝试更宽松的数据读取...');
        allDataRows = data.slice(1).filter(row => 
          Array.isArray(row) && row.length > 0 && 
          row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '')
        );
        console.log('宽松模式下的有效数据行数:', allDataRows.length);
      }
      
    } catch (readError) {
      console.error('数据读取错误:', readError);
      // 如果读取失败，尝试简单模式
      try {
        console.log('尝试简单模式读取...');
        data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        headers = data[0] || [];
        allDataRows = data.slice(1).filter(row => Array.isArray(row) && row.length > 0);
        console.log('简单模式结果 - 数据行数:', allDataRows.length);
      } catch (simpleError) {
        console.error('简单模式也失败:', simpleError);
        data = [[]];
        headers = [];
        allDataRows = [];
      }
    }
    
    // 优化的分页处理 - 只处理当前页需要的数据
    const totalRows = allDataRows.length;
    const totalPages = Math.ceil(totalRows / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    console.log(`分页信息: 第${page}页, 总${totalPages}页, 索引${startIndex}-${endIndex}, 总行数${totalRows}`);
    
    // 只取当前页的数据，减少内存使用
    const currentPageData = allDataRows.slice(startIndex, endIndex);
    console.log('当前页数据行数:', currentPageData.length);
    
    // 快速分析所有工作表信息（不读取完整数据）
    const allSheets = workbook.SheetNames.map(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      
      // 快速获取范围信息，避免读取所有数据
      if (sheet['!ref']) {
        const range = XLSX.utils.decode_range(sheet['!ref']);
        const rowCount = Math.max(0, range.e.r); // 减1因为第一行是标题
        const colCount = Math.min(range.e.c + 1, 100); // 限制显示列数
        
        // 只读取标题行，不读取所有数据
        const headerData = XLSX.utils.sheet_to_json(sheet, { 
          header: 1, 
          range: { s: { c: 0, r: 0 }, e: { c: Math.min(99, range.e.c), r: 0 } }
        });
        const headers = headerData[0] || [];
        
        return {
          name: sheetName,
          rowCount: rowCount,
          colCount: colCount,
          headers: headers.slice(0, 15)
        };
      } else {
        return {
          name: sheetName,
          rowCount: 0,
          colCount: 0,
          headers: []
        };
      }
    });
    
    const processingTime = Date.now() - startTime;
    console.log(`工作表处理完成，耗时: ${processingTime}ms`);
    
    res.json({
      success: true,
      analysis: {
        fileName: file.originalName,
        currentSheet: targetSheetName,
        allSheets: allSheets,
        headers: headers,
        data: currentPageData,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalRows: totalRows,
          limit: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        summary: {
          uploadTime: file.uploadTime,
          fileSize: file.size,
          uploadedBy: file.uploadedBy,
          totalSheets: workbook.SheetNames.length
        },
        performance: {
          processingTime: processingTime
        }
      }
    });
  } catch (error) {
    console.error('分析错误:', error);
    res.status(500).json({ error: '数据分析失败: ' + error.message });
  }
});

// 删除文件
app.delete('/api/files/:id', authenticateToken, (req, res) => {
  try {
    const files = readFiles();
    const fileIndex = files.findIndex(f => f.id == req.params.id);

    if (fileIndex === -1) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const file = files[fileIndex];

    // 检查权限
    if (req.user.role !== 'admin' && file.userId !== req.user.id) {
      return res.status(403).json({ error: '没有删除权限' });
    }

    // 删除物理文件
    const filePath = path.join(uploadsDir, file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 从数据中删除
    files.splice(fileIndex, 1);
    writeFiles(files);

    res.json({ success: true, message: '文件删除成功' });
  } catch (error) {
    res.status(500).json({ error: '删除失败' });
  }
});

// 双模式本地数据库API

// ==================== 宽表模式API ====================

// 获取宽表数据（最近5天）
app.get('/api/localdb/wide', authenticateToken, (req, res) => {
  try {
    const data = readWideTable();
    // 收集所有SKU的所有日期
    const allDatesSet = new Set();
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          allDatesSet.add(key);
        }
      });
    });
    const allDates = Array.from(allDatesSet).sort();
    // 取最近五天
    const dateColumns = [];
    let idx = allDates.length - 1;
    while (dateColumns.length < 5 && idx >= 0) {
      dateColumns.unshift(allDates[idx]);
      idx--;
    }
    // 只保留最近五天的字段
    const filteredData = data.map(row => {
      const base = {
        SKU: row.SKU,
        '产品中文名': row['产品中文名'],
        '网页链接': row['网页链接'],
        '初始库存': row['初始库存']
      };
      dateColumns.forEach(date => {
        if (row[date] !== undefined) base[date] = row[date];
        if (row[date + '_销量'] !== undefined) base[date + '_销量'] = row[date + '_销量'];
      });
      return base;
    });
    res.json({
      success: true,
      data: filteredData,
      dateColumns: dateColumns
    });
  } catch (error) {
    res.status(500).json({ error: '获取宽表数据失败: ' + error.message });
  }
});

// 保存宽表数据
app.post('/api/localdb/wide', authenticateToken, (req, res) => {
  try {
    const { data } = req.body;
    
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: '数据格式错误' });
    }

    writeWideTable(data);

    res.json({
      success: true,
      message: '宽表数据保存成功'
    });
  } catch (error) {
    res.status(500).json({ error: '保存宽表数据失败: ' + error.message });
  }
});

// 批量导入宽表数据
app.post('/api/localdb/wide/batch', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    // 智能识别数据格式
    const firstRow = jsonData[0] || {};
    const isWideTable = Object.keys(firstRow).some(key => {
      // 检查是否包含日期格式的列（YYYY-MM-DD）
      return /^\d{4}-\d{2}-\d{2}$/.test(key);
    });

    // 收集所有日期
    let allDatesSet = new Set();
    jsonData.forEach(row => {
      Object.keys(row).forEach(key => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          allDatesSet.add(key);
        }
      });
    });
    const allDates = Array.from(allDatesSet).sort();
    // 取最近五天
    const recentDates = [];
    let idx = allDates.length - 1;
    while (recentDates.length < 5 && idx >= 0) {
      recentDates.unshift(allDates[idx]);
      idx--;
    }

    const records = readRecords();
    let wideTableData = [];

    if (isWideTable) {
      // 宽表格式：分流
      wideTableData = jsonData.map(row => {
        const record = {
          SKU: row.SKU || '',
          '产品中文名': row['产品中文名'] || '',
          '网页链接': row['网页链接'] || '',
          '初始库存': parseInt(row['初始库存']) || 0
        };
        // 日期排序
        const dateKeys = Object.keys(row).filter(key => 
          /^\d{4}-\d{2}-\d{2}$/.test(key) && !key.includes('_销量')
        ).sort();
        dateKeys.forEach((key, index) => {
          const stock = parseInt(row[key]) || 0;
          let sales = 0;
          if (index === 0) {
            sales = Math.max(0, record['初始库存'] - stock);
          } else {
            const prevKey = dateKeys[index - 1];
            const prevStock = parseInt(row[prevKey]) || 0;
            sales = Math.max(0, prevStock - stock);
          }
          if (recentDates.includes(key)) {
            record[key] = stock;
            record[key + '_销量'] = sales;
          } else if (stock > 0) {
            // 进入历史记录
            records.push({
              id: Date.now() + Math.random(),
              SKU: record.SKU,
              '产品中文名': record['产品中文名'],
              '网页链接': record['网页链接'],
              '初始库存': record['初始库存'],
              '日期': key,
              '库存': stock,
              '销量': sales,
              createTime: new Date().toISOString(),
              createBy: req.user ? req.user.username : 'system'
            });
          }
        });
        return record;
      });
    } else {
      // 行记录格式：转换为宽表格式后再分流
      const tempWide = convertRecordsToWideTable(jsonData);
      wideTableData = tempWide.map(row => {
        const record = {
          SKU: row.SKU,
          '产品中文名': row['产品中文名'],
          '网页链接': row['网页链接'],
          '初始库存': row['初始库存']
        };
        const dateKeys = Object.keys(row).filter(key => 
          /^\d{4}-\d{2}-\d{2}$/.test(key) && !key.includes('_销量')
        ).sort();
        dateKeys.forEach((key, index) => {
          const stock = parseInt(row[key]) || 0;
          let sales = 0;
          if (index === 0) {
            sales = Math.max(0, record['初始库存'] - stock);
          } else {
            const prevKey = dateKeys[index - 1];
            const prevStock = parseInt(row[prevKey]) || 0;
            sales = Math.max(0, prevStock - stock);
          }
          if (recentDates.includes(key)) {
            record[key] = stock;
            record[key + '_销量'] = sales;
          } else if (stock > 0) {
            records.push({
              id: Date.now() + Math.random(),
              SKU: record.SKU,
              '产品中文名': record['产品中文名'],
              '网页链接': record['网页链接'],
              '初始库存': record['初始库存'],
              '日期': key,
              '库存': stock,
              '销量': sales,
              createTime: new Date().toISOString(),
              createBy: req.user ? req.user.username : 'system'
            });
          }
        });
        return record;
      });
    }

    writeWideTable(wideTableData);
    writeRecords(records);
    fs.unlinkSync(req.file.path);
    res.json({
      success: true,
      message: `成功导入 ${wideTableData.length} 条宽表记录，历史记录已更新`,
      count: wideTableData.length,
      format: isWideTable ? 'wide' : 'converted'
    });
  } catch (error) {
    res.status(500).json({ error: '批量导入失败: ' + error.message });
  }
});

// 将行记录格式转换为宽表格式
function convertRecordsToWideTable(records) {
  const skuMap = new Map();
  
  // 按SKU分组
  records.forEach(record => {
    const sku = record.SKU || record['SKU'] || '';
    const name = record['产品中文名'] || record['产品名称'] || '';
    const url = record['网页链接'] || record['链接'] || '';
    const date = record['日期'] || record['时间'] || '';
    const stock = parseInt(record['库存']) || 0;
    const initialStock = parseInt(record['初始库存']) || 0;
    
    if (!sku || !date) return;
    
    if (!skuMap.has(sku)) {
      skuMap.set(sku, {
        SKU: sku,
        '产品中文名': name,
        '网页链接': url,
        '初始库存': initialStock,
        records: []
      });
    }
    
    skuMap.get(sku).records.push({
      date: date,
      stock: stock,
      initialStock: initialStock
    });
  });
  
  // 处理每个SKU的数据
  const result = [];
  skuMap.forEach((skuGroup, sku) => {
    // 按日期排序
    skuGroup.records.sort((a, b) => a.date.localeCompare(b.date));
    
    const wideRecord = {
      SKU: sku,
      '产品中文名': skuGroup['产品中文名'],
      '网页链接': skuGroup['网页链接'],
      '初始库存': skuGroup['初始库存']
    };
    
    skuGroup.records.forEach((record, index) => {
      let sales = 0;
      
      if (index === 0) {
        // 第一个日期：使用初始库存计算
        sales = Math.max(0, skuGroup['初始库存'] - record.stock);
      } else {
        // 其他日期：使用前一天库存计算
        const prevRecord = skuGroup.records[index - 1];
        sales = Math.max(0, prevRecord.stock - record.stock);
      }
      
      wideRecord[record.date] = record.stock;
      wideRecord[record.date + '_销量'] = sales;
    });
    
    result.push(wideRecord);
  });
  
  return result;
}

// 导出宽表数据
app.get('/api/localdb/wide/export', authenticateToken, (req, res) => {
  try {
    const data = readWideTable();
    
    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // 设置列宽
    const colWidths = [
      { wch: 15 }, // SKU
      { wch: 30 }, // 产品中文名
      { wch: 40 }, // 网页链接
      { wch: 12 }, // 日期1
      { wch: 12 }, // 日期2
      { wch: 12 }, // 日期3
      { wch: 12 }, // 日期4
      { wch: 12 }  // 日期5
    ];
    worksheet['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, '宽表数据');
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=wide-table-export.xlsx');
    
    // 写入响应
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: '导出失败: ' + error.message });
  }
});

// 清理旧数据（将5天前的数据移动到历史记录）
app.post('/api/localdb/wide/clear', authenticateToken, (req, res) => {
  try {
    const wideData = readWideTable();
    const records = readRecords();
    
    // 计算5天前的日期
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const fiveDaysAgoStr = fiveDaysAgo.toISOString().split('T')[0];
    
    // 将宽表数据转换为历史记录
    const newRecords = [];
    wideData.forEach(row => {
      Object.keys(row).forEach(key => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          // 只处理5天前的数据
          if (key < fiveDaysAgoStr && row[key] > 0) {
            newRecords.push({
              id: Date.now() + Math.random(),
              SKU: row.SKU,
              '产品中文名': row['产品中文名'],
              '网页链接': row['网页链接'],
              '日期': key,
              '库存': row[key],
              createTime: new Date().toISOString(),
              createBy: req.user.username
            });
          }
        }
      });
    });
    
    // 添加到历史记录
    records.push(...newRecords);
    writeRecords(records);
    
    // 清空宽表数据
    writeWideTable([]);
    
    res.json({
      success: true,
      message: `成功清理 ${newRecords.length} 条历史记录`,
      count: newRecords.length
    });
  } catch (error) {
    res.status(500).json({ error: '清理失败: ' + error.message });
  }
});

// 清空所有宽表数据
app.post('/api/localdb/wide/clear-all', authenticateToken, (req, res) => {
  try {
    writeWideTable([]);
    
    res.json({
      success: true,
      message: '成功清空所有宽表数据'
    });
  } catch (error) {
    res.status(500).json({ error: '清空失败: ' + error.message });
  }
});

// 智能导入API - 自动识别格式并分类
app.post('/api/localdb/smart-import', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    console.log('开始智能导入，文件路径:', req.file.path);
    console.log('文件大小:', req.file.size);

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    console.log('Excel解析结果:');
    console.log('- 工作表数量:', workbook.SheetNames.length);
    console.log('- 工作表名称:', workbook.SheetNames);
    console.log('- 解析数据行数:', jsonData.length);
    console.log('- 第一行数据:', jsonData[0]);

    // 智能识别数据格式
    const firstRow = jsonData[0] || {};
    
    // 检查是否有日期格式的列（排除销量列）
    const hasDateColumns = Object.keys(firstRow).some(key => {
      return /^\d{4}-\d{2}-\d{2}$/.test(key) && !key.includes('_销量');
    });
    
    // 检查是否有SKU列
    const hasSkuColumn = Object.keys(firstRow).some(key => {
      return key.toLowerCase().includes('sku');
    });
    
    // 检查是否有库存列
    const hasStockColumn = Object.keys(firstRow).some(key => {
      return key.includes('库存') || key.toLowerCase().includes('stock');
    });
    
    // 检查是否有日期列
    const hasDateColumn = Object.keys(firstRow).some(key => {
      return key.includes('日期') || key.includes('时间') || key.toLowerCase().includes('date');
    });
    
    // 判断格式：如果有日期格式列，则为宽表；如果有日期列+库存列，则为行记录
    const isWideTable = hasDateColumns;
    const isRecordFormat = hasDateColumn && hasStockColumn && !hasDateColumns;

    console.log('格式识别结果:');
    console.log('- 第一行键名:', Object.keys(firstRow));
    console.log('- 是否有日期格式列:', hasDateColumns);
    console.log('- 是否有SKU列:', hasSkuColumn);
    console.log('- 是否有库存列:', hasStockColumn);
    console.log('- 是否有日期列:', hasDateColumn);
    console.log('- 是否为宽表格式:', isWideTable);
    console.log('- 是否为行记录格式:', isRecordFormat);

    if (isWideTable) {
      // 宽表格式：按日期分类
      const wideData = [];
      const records = readRecords();
      
      jsonData.forEach(row => {
        const record = {
          SKU: row.SKU || '',
          '产品中文名': row['产品中文名'] || '',
          '网页链接': row['网页链接'] || '',
          '初始库存': parseInt(row['初始库存']) || 0
        };
        
        const today = new Date();
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        const fiveDaysAgoStr = fiveDaysAgo.toISOString().split('T')[0];
        
        // 按日期排序，确保销量计算正确
        const dateKeys = Object.keys(row).filter(key => 
          /^\d{4}-\d{2}-\d{2}$/.test(key) && !key.includes('_销量')
        ).sort();
        
        dateKeys.forEach((key, index) => {
          const stock = parseInt(row[key]) || 0;
          let sales = 0;
          
          if (index === 0) {
            // 第一个日期：使用初始库存计算
            sales = Math.max(0, record['初始库存'] - stock);
          } else {
            // 其他日期：使用前一天库存计算
            const prevKey = dateKeys[index - 1];
            const prevStock = parseInt(row[prevKey]) || 0;
            sales = Math.max(0, prevStock - stock);
          }
          
          if (key >= fiveDaysAgoStr) {
            // 最近5天：放入宽表
            record[key] = stock;
            record[key + '_销量'] = sales;
          } else if (stock > 0) {
            // 5天前且有库存：放入历史记录
            records.push({
              id: Date.now() + Math.random(),
              SKU: record.SKU,
              '产品中文名': record['产品中文名'],
              '网页链接': record['网页链接'],
              '初始库存': record['初始库存'],
              '日期': key,
              '库存': stock,
              '销量': sales,
              createTime: new Date().toISOString(),
              createBy: req.user.username
            });
          }
        });
        
        wideData.push(record);
      });
      
      writeWideTable(wideData);
      writeRecords(records);
      
      console.log('宽表格式处理结果:');
      console.log('- 宽表记录数:', wideData.length);
      console.log('- 历史记录数:', records.length);
      
      res.json({
        success: true,
        message: `智能导入完成：${wideData.length} 条宽表记录，${records.length} 条历史记录`,
        wideCount: wideData.length,
        recordCount: records.length
      });
    } else if (isRecordFormat) {
      // 行记录格式：按日期分类
      const wideData = [];
      const records = readRecords();
      
      const today = new Date();
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const fiveDaysAgoStr = fiveDaysAgo.toISOString().split('T')[0];
      
      const skuMap = new Map();
      
      // 按SKU分组并按日期排序
      const skuGroups = {};
      jsonData.forEach(record => {
        const sku = record.SKU || record['SKU'] || '';
        const name = record['产品中文名'] || record['产品名称'] || '';
        const url = record['网页链接'] || record['链接'] || '';
        const date = record['日期'] || record['时间'] || '';
        const stock = parseInt(record['库存']) || 0;
        const initialStock = parseInt(record['初始库存']) || 0;
        
        if (!sku || !date) return;
        
        if (!skuGroups[sku]) {
          skuGroups[sku] = {
            SKU: sku,
            '产品中文名': name,
            '网页链接': url,
            '初始库存': initialStock,
            records: []
          };
        }
        
        skuGroups[sku].records.push({
          date: date,
          stock: stock,
          initialStock: initialStock
        });
      });
      
      // 处理每个SKU的数据
      Object.values(skuGroups).forEach(skuGroup => {
        // 按日期排序
        skuGroup.records.sort((a, b) => a.date.localeCompare(b.date));
        
        skuGroup.records.forEach((record, index) => {
          let sales = 0;
          
          if (index === 0) {
            // 第一个日期：使用初始库存计算
            sales = Math.max(0, skuGroup['初始库存'] - record.stock);
          } else {
            // 其他日期：使用前一天库存计算
            const prevRecord = skuGroup.records[index - 1];
            sales = Math.max(0, prevRecord.stock - record.stock);
          }
          
          if (record.date >= fiveDaysAgoStr) {
            // 最近5天：放入宽表
            if (!skuMap.has(skuGroup.SKU)) {
              skuMap.set(skuGroup.SKU, {
                SKU: skuGroup.SKU,
                '产品中文名': skuGroup['产品中文名'],
                '网页链接': skuGroup['网页链接'],
                '初始库存': skuGroup['初始库存']
              });
            }
            const wideRecord = skuMap.get(skuGroup.SKU);
            wideRecord[record.date] = record.stock;
            wideRecord[record.date + '_销量'] = sales;
          } else if (record.stock > 0) {
            // 5天前且有库存：放入历史记录
            records.push({
              id: Date.now() + Math.random(),
              SKU: skuGroup.SKU,
              '产品中文名': skuGroup['产品中文名'],
              '网页链接': skuGroup['网页链接'],
              '初始库存': skuGroup['初始库存'],
              '日期': record.date,
              '库存': record.stock,
              '销量': sales,
              createTime: new Date().toISOString(),
              createBy: req.user.username
            });
          }
        });
      });
      
      writeWideTable(Array.from(skuMap.values()));
      writeRecords(records);
      
      console.log('行记录格式处理结果:');
      console.log('- 宽表记录数:', skuMap.size);
      console.log('- 历史记录数:', records.length);
      
      res.json({
        success: true,
        message: `智能导入完成：${skuMap.size} 条宽表记录，${records.length} 条历史记录`,
        wideCount: skuMap.size,
        recordCount: records.length
      });
    } else {
      // 无法识别的格式
      console.log('无法识别的数据格式');
      res.status(400).json({ 
        error: '无法识别的数据格式，请检查文件格式是否正确',
        detectedColumns: Object.keys(firstRow),
        sampleData: jsonData.slice(0, 3)
      });
    }

    // 删除临时文件
    fs.unlinkSync(req.file.path);
  } catch (error) {
    res.status(500).json({ error: '智能导入失败: ' + error.message });
  }
});

// ==================== 行记录模式API ====================

// 获取历史记录数据
app.get('/api/localdb/records', authenticateToken, (req, res) => {
  try {
    const data = readRecords();
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    res.status(500).json({ error: '获取历史记录失败: ' + error.message });
  }
});

// 添加历史记录
app.post('/api/localdb/records', authenticateToken, (req, res) => {
  try {
    const { SKU, '产品中文名': name, '网页链接': url, '初始库存': initialStock, '日期': date, '库存': stock } = req.body;
    
    if (!SKU || !name || !date || stock === undefined || initialStock === undefined) {
      return res.status(400).json({ error: 'SKU、产品中文名、初始库存、日期、库存为必填项' });
    }

    const data = readRecords();
    const sales = Math.max(0, parseInt(initialStock) - parseInt(stock));
    const newRecord = {
      id: Date.now(),
      SKU: SKU,
      '产品中文名': name,
      '网页链接': url || '',
      '初始库存': parseInt(initialStock) || 0,
      '日期': date,
      '库存': parseInt(stock) || 0,
      '销量': sales,
      createTime: new Date().toISOString(),
      createBy: req.user.username
    };

    data.push(newRecord);
    writeRecords(data);

    res.json({
      success: true,
      data: newRecord
    });
  } catch (error) {
    res.status(500).json({ error: '添加记录失败: ' + error.message });
  }
});

// 更新历史记录
app.put('/api/localdb/records/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { SKU, '产品中文名': name, '网页链接': url, '初始库存': initialStock, '日期': date, '库存': stock } = req.body;
    
    if (!SKU || !name || !date || stock === undefined || initialStock === undefined) {
      return res.status(400).json({ error: 'SKU、产品中文名、初始库存、日期、库存为必填项' });
    }

    const data = readRecords();
    const recordIndex = data.findIndex(item => item.id === id);

    if (recordIndex === -1) {
      return res.status(404).json({ error: '记录不存在' });
    }

    const sales = Math.max(0, parseInt(initialStock) - parseInt(stock));
    data[recordIndex] = {
      ...data[recordIndex],
      SKU: SKU,
      '产品中文名': name,
      '网页链接': url || '',
      '初始库存': parseInt(initialStock) || 0,
      '日期': date,
      '库存': parseInt(stock) || 0,
      '销量': sales,
      updateTime: new Date().toISOString(),
      updateBy: req.user.username
    };

    writeRecords(data);

    res.json({
      success: true,
      data: data[recordIndex]
    });
  } catch (error) {
    res.status(500).json({ error: '更新记录失败: ' + error.message });
  }
});

// 删除历史记录
app.delete('/api/localdb/records/:id', authenticateToken, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = readRecords();
    const recordIndex = data.findIndex(item => item.id === id);

    if (recordIndex === -1) {
      return res.status(404).json({ error: '记录不存在' });
    }

    data.splice(recordIndex, 1);
    writeRecords(data);

    res.json({
      success: true,
      message: '记录删除成功'
    });
  } catch (error) {
    res.status(500).json({ error: '删除记录失败: ' + error.message });
  }
});

// 批量导入历史记录
app.post('/api/localdb/records/batch', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const data = readRecords();
    const newRecords = jsonData.map((row, index) => ({
      id: Date.now() + index,
      SKU: row.SKU || row['SKU'] || '',
      '产品中文名': row['产品中文名'] || row['产品名称'] || '',
      '网页链接': row['网页链接'] || row['链接'] || '',
      '日期': row['日期'] || row['时间'] || '',
      '库存': parseInt(row['库存']) || 0,
      createTime: new Date().toISOString(),
      createBy: req.user.username
    }));

    data.push(...newRecords);
    writeRecords(data);

    // 删除临时文件
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `成功导入 ${newRecords.length} 条历史记录`,
      count: newRecords.length
    });
  } catch (error) {
    res.status(500).json({ error: '批量导入失败: ' + error.message });
  }
});

// 导出历史记录
app.get('/api/localdb/records/export', authenticateToken, (req, res) => {
  try {
    const data = readRecords();
    
    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // 设置列宽
    const colWidths = [
      { wch: 15 }, // SKU
      { wch: 30 }, // 产品中文名
      { wch: 40 }, // 网页链接
      { wch: 20 }, // 日期
      { wch: 10 }, // 库存
      { wch: 20 }, // 创建时间
      { wch: 15 }  // 创建者
    ];
    worksheet['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, '历史记录');
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=records-export.xlsx');
    
    // 写入响应
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: '导出失败: ' + error.message });
  }
});

// 清空所有历史记录
app.post('/api/localdb/records/clear-all', authenticateToken, (req, res) => {
  try {
    writeRecords([]);
    
    res.json({
      success: true,
      message: '成功清空所有历史记录'
    });
  } catch (error) {
    res.status(500).json({ error: '清空失败: ' + error.message });
  }
});

// ==================== 数据分析API ====================

// 获取数据分析概览
app.get('/api/analysis/overview', authenticateToken, (req, res) => {
  try {
    const wideData = readWideTable();
    const records = readRecords();
    
    // 计算基础统计
    const totalSku = wideData.length;
    const totalRecords = records.length;
    
    // 计算库存健康率
    let healthyStock = 0;
    let warningStock = 0;
    let outOfStock = 0;
    
    wideData.forEach(item => {
      const latestStock = getLatestStock(item);
      if (latestStock === 0) {
        outOfStock++;
      } else if (latestStock < 20) {
        warningStock++;
      } else {
        healthyStock++;
      }
    });
    
    const healthRate = totalSku > 0 ? Math.round((healthyStock / totalSku) * 100 * 10) / 10 : 0;
    
    // 计算平均周转率
    let totalTurnover = 0;
    let turnoverCount = 0;
    
    wideData.forEach(item => {
      const turnover = calculateTurnover(item);
      if (turnover > 0) {
        totalTurnover += turnover;
        turnoverCount++;
      }
    });
    
    const avgTurnover = turnoverCount > 0 ? Math.round((totalTurnover / turnoverCount) * 10) / 10 : 0;
    
    // 计算库存价值（假设每个SKU平均价值1000元）
    const estimatedValue = totalSku * 1000;
    
    res.json({
      success: true,
      data: {
        totalSku: totalSku,
        healthRate: healthRate,
        avgTurnover: avgTurnover,
        warningCount: warningStock + outOfStock,
        estimatedValue: estimatedValue,
        totalRecords: totalRecords
      }
    });
  } catch (error) {
    res.status(500).json({ error: '获取分析概览失败: ' + error.message });
  }
});

// 获取库存趋势数据
app.get('/api/analysis/stock-trend', authenticateToken, (req, res) => {
  try {
    const wideData = readWideTable();
    const records = readRecords();
    const { days = 30 } = req.query;
    // 生成日期范围
    const dates = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
    // 计算每日库存数据（宽表+行记录）
    const stockData = {
      total: [],
      healthy: [],
      warning: [],
      outOfStock: []
    };
    dates.forEach(date => {
      let total = 0, healthy = 0, warning = 0, outOfStock = 0;
      // 宽表部分
      wideData.forEach(item => {
        const stock = parseInt(item[date]) || 0;
        total += stock;
        if (stock === 0) {
          outOfStock++;
        } else if (stock < 20) {
          warning++;
        } else {
          healthy++;
        }
      });
      // 行记录部分（只统计该日期的库存）
      records.forEach(rec => {
        if (rec['日期'] === date) {
          const stock = parseInt(rec['库存']) || 0;
          total += stock;
          if (stock === 0) {
            outOfStock++;
          } else if (stock < 20) {
            warning++;
          } else {
            healthy++;
          }
        }
      });
      stockData.total.push(total);
      stockData.healthy.push(healthy);
      stockData.warning.push(warning);
      stockData.outOfStock.push(outOfStock);
    });
    res.json({
      success: true,
      data: {
        dates: dates,
        series: stockData
      }
    });
  } catch (error) {
    res.status(500).json({ error: '获取库存趋势失败: ' + error.message });
  }
});

// 获取销售趋势数据
app.get('/api/analysis/sales-trend', authenticateToken, (req, res) => {
  try {
    const wideData = readWideTable();
    const { days = 30 } = req.query;
    
    // 生成日期范围
    const dates = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    // 计算每日销售数据
    const salesData = {
      quantity: [],
      amount: []
    };
    
    dates.forEach(date => {
      let totalQuantity = 0;
      let totalAmount = 0;
      
      wideData.forEach(item => {
        const sales = parseInt(item[date + '_销量']) || 0;
        totalQuantity += sales;
        // 假设每个SKU平均单价100元
        totalAmount += sales * 100;
      });
      
      salesData.quantity.push(totalQuantity);
      salesData.amount.push(Math.round(totalAmount / 10000 * 10) / 10); // 转换为万元
    });
    
    res.json({
      success: true,
      data: {
        dates: dates,
        series: salesData
      }
    });
  } catch (error) {
    res.status(500).json({ error: '获取销售趋势失败: ' + error.message });
  }
});

// 获取SKU详细分析
app.get('/api/analysis/sku-details', authenticateToken, (req, res) => {
  try {
    const wideData = readWideTable();
    const { limit = 10 } = req.query;
    
    const skuAnalysis = wideData.map(item => {
      const latestStock = getLatestStock(item);
      const totalSales = calculateTotalSales(item);
      const turnover = calculateTurnover(item);
      const trend = calculateSalesTrend(item);
      const status = getStockStatus(latestStock);
      const suggestion = getSuggestion(status, trend, turnover);
      
      return {
        sku: item.SKU,
        name: item['产品中文名'],
        url: item['网页链接'] || '', // 添加URL字段
        currentStock: latestStock,
        totalSales: totalSales,
        turnover: turnover,
        status: status,
        trend: trend,
        suggestion: suggestion
      };
    });
    
    // 按销量排序并限制数量
    skuAnalysis.sort((a, b) => b.totalSales - a.totalSales);
    const topSku = skuAnalysis.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: topSku
    });
  } catch (error) {
    res.status(500).json({ error: '获取SKU分析失败: ' + error.message });
  }
});

// 天猫订单分析接口
app.get('/api/tmall-orders/analysis/sku-details', authenticateToken, (req, res) => {
  try {
    const tmallData = readTmallOrders();
    const { limit = 10 } = req.query;
    // 分析逻辑与本地一致
    const skuAnalysis = tmallData.map(item => {
      // 兼容字段
      const sku = item.SKU || item.sku;
      const name = item['产品中文名'] || item['产品名称'] || '';
      const url = item['网页链接'] || item['url'] || '';
      // 统计销量与库存
      let totalSales = 0;
      let currentStock = 0;
      Object.keys(item).forEach(key => {
        if (key.includes('_销量')) {
          totalSales += parseInt(item[key]) || 0;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          currentStock = parseInt(item[key]) || currentStock;
        }
      });
      return {
        sku,
        name,
        url,
        currentStock,
        totalSales,
        turnover: 0,
        trend: '',
        status: '',
        suggestion: ''
      };
    });
    skuAnalysis.sort((a, b) => b.totalSales - a.totalSales);
    const topSku = skuAnalysis.slice(0, parseInt(limit));
    res.json({ success: true, data: topSku });
  } catch (error) {
    res.status(500).json({ error: '天猫订单分析失败: ' + error.message });
  }
});

// 天猫数据库API
// 宽表数据
app.get('/api/tmall-orders/wide', authenticateToken, (req, res) => {
  try {
    const data = readTmallOrders();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: '获取天猫宽表数据失败: ' + error.message });
  }
});
app.post('/api/tmall-orders/wide', authenticateToken, (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: '数据格式错误' });
    }
    writeTmallOrders(data);
    res.json({ success: true, message: '天猫宽表数据保存成功' });
  } catch (error) {
    res.status(500).json({ error: '保存天猫宽表数据失败: ' + error.message });
  }
});
// 批量导入宽表
app.post('/api/tmall-orders/wide/batch', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    // 自动转换为宽表
    const wideData = convertTmallRowsToWideTable(jsonData);
    writeTmallOrders(wideData);
    fs.unlinkSync(req.file.path);
    res.json({ success: true, message: `成功导入 ${wideData.length} 条天猫宽表记录（已转宽表）`, count: wideData.length });
  } catch (error) {
    res.status(500).json({ error: '批量导入失败: ' + error.message });
  }
});
// 导出宽表
app.get('/api/tmall-orders/wide/export', authenticateToken, (req, res) => {
  try {
    const data = readTmallOrders();
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, '天猫宽表数据');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=tmall-wide-table-export.xlsx');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: '导出失败: ' + error.message });
  }
});
// 清空宽表
app.post('/api/tmall-orders/wide/clear-all', authenticateToken, (req, res) => {
  try {
    writeTmallOrders([]);
    res.json({ success: true, message: '成功清空所有天猫宽表数据' });
  } catch (error) {
    res.status(500).json({ error: '清空失败: ' + error.message });
  }
});
// 智能导入
app.post('/api/tmall-orders/smart-import', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    // 自动转换为宽表
    const wideData = convertTmallRowsToWideTable(jsonData);
    writeTmallOrders(wideData);
    fs.unlinkSync(req.file.path);
    res.json({ success: true, message: `智能导入成功: ${wideData.length} 条天猫订单（已转宽表）` });
  } catch (error) {
    res.status(500).json({ error: '智能导入失败: ' + error.message });
  }
});

// 辅助函数
function getLatestStock(item) {
  const dateKeys = Object.keys(item).filter(key => 
    /^\d{4}-\d{2}-\d{2}$/.test(key) && !key.includes('_销量')
  ).sort();
  
  if (dateKeys.length === 0) return 0;
  return parseInt(item[dateKeys[dateKeys.length - 1]]) || 0;
}

function calculateTotalSales(item) {
  let total = 0;
  Object.keys(item).forEach(key => {
    if (key.includes('_销量')) {
      total += parseInt(item[key]) || 0;
    }
  });
  return total;
}

function calculateTurnover(item) {
  const latestStock = getLatestStock(item);
  const totalSales = calculateTotalSales(item);
  
  if (latestStock === 0) return 0;
  return Math.round((totalSales / latestStock) * 10) / 10;
}

function calculateSalesTrend(item) {
  const dateKeys = Object.keys(item).filter(key => 
    key.includes('_销量')
  ).sort();
  
  if (dateKeys.length < 2) return 'stable';
  
  const recentSales = parseInt(item[dateKeys[dateKeys.length - 1]]) || 0;
  const previousSales = parseInt(item[dateKeys[dateKeys.length - 2]]) || 0;
  
  if (recentSales > previousSales * 1.1) return 'up';
  if (recentSales < previousSales * 0.9) return 'down';
  return 'stable';
}

function getStockStatus(stock) {
  if (stock === 0) return 'outOfStock';
  if (stock < 20) return 'warning';
  return 'healthy';
}

function getSuggestion(status, trend, turnover) {
  if (status === 'outOfStock') return '紧急补货';
  if (status === 'warning' && trend === 'up') return '增加备货';
  if (trend === 'down' && turnover < 1) return '促销清库';
  if (trend === 'up' && turnover > 5) return '增加备货';
  return '维持现状';
}

// 天猫订单上传API
app.post('/api/tmall-orders/upload', (req, res) => {
  try {
    const data = req.body.data;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: '数据格式错误' });
    }
    writeTmallOrders(data);
    res.json({ success: true, message: '天猫订单数据保存成功' });
  } catch (error) {
    res.status(500).json({ error: '天猫订单数据保存失败: ' + error.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: '数据管理系统后端运行正常'
  });
});

// 商品页面库存爬取（基础版）
// 用法：POST /api/scraper/inventory  { url: 'https://...' }
app.post('/api/scraper/inventory', authenticateToken, async (req, res) => {
  try {
    const { url: targetUrl } = req.body || {};
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).json({ error: '请输入有效URL（http/https）' });
    }

    const html = await fetchPageContent(targetUrl);
    if (!html) {
      return res.status(500).json({ error: '抓取页面失败' });
    }

    const analysis = analyzeInventoryFromHtml(html);

    res.json({
      success: true,
      url: targetUrl,
      matchedKeys: analysis.matchedKeys,
      snippets: analysis.snippets,
      meta: {
        htmlLength: html.length,
        scriptCount: analysis.scriptCount
      }
    });
  } catch (error) {
    console.error('库存爬取错误:', error);
    res.status(500).json({ error: '库存爬取失败: ' + error.message });
  }
});

// Arc'teryx 变体库存解析接口：返回 { sku, inventory } 列表
app.post('/api/scraper/arcteryx/variants', authenticateToken, async (req, res) => {
  try {
    const { url: targetUrl } = req.body || {};
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).json({ error: '请输入有效URL（http/https）' });
    }
    const html = await fetchPageContent(targetUrl);
    if (!html) {
      return res.status(500).json({ error: '抓取页面失败' });
    }

    const result = extractArcteryxVariants(html);
    res.json({ success: true, url: targetUrl, mpn: result.mpn, items: result.items });
  } catch (error) {
    console.error('Arc\'teryx变体解析错误:', error);
    res.status(500).json({ error: 'Arc\'teryx变体解析失败: ' + error.message });
  }
});

// 初始化数据文件
initDataFiles();

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`📊 数据管理系统后端服务器启动成功!`);
  console.log(`🚀 本地访问地址: http://localhost:${PORT}`);
  console.log(`🌐 局域网访问地址: http://你的IP地址:${PORT}`);
  console.log(`📁 文件存储目录: ${uploadsDir}`);
  console.log(`💾 数据文件目录: ${dataDir}`);
  console.log(`\n💡 部署说明:`);
  console.log(`1. 局域网部署：同事可通过 http://你的IP地址:${PORT} 访问`);
  console.log(`2. 公网部署：需要配置域名和SSL证书`);
  console.log(`3. 默认管理员账号：admin / 123456`);
});

module.exports = app; 

// 抓取网页内容（处理最多5次重定向）
async function fetchPageContent(targetUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(targetUrl);
      const isHttps = urlObj.protocol === 'https:';
      const lib = isHttps ? https : http;
      const options = {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'identity',
          'Connection': 'close'
        },
        timeout: 15000
      };

      const req = lib.request(targetUrl, options, (resp) => {
        const status = resp.statusCode || 0;
        const location = resp.headers['location'];
        // 处理重定向
        if ([301, 302, 303, 307, 308].includes(status) && location && redirectCount < 5) {
          const nextUrl = new URL(location, targetUrl).href;
          resp.resume();
          resolve(fetchPageContent(nextUrl, redirectCount + 1));
          return;
        }

        if (status < 200 || status >= 400) {
          resp.resume();
          reject(new Error('HTTP状态码异常: ' + status));
          return;
        }

        let data = '';
        resp.setEncoding('utf8');
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => resolve(data));
      });

      req.on('timeout', () => {
        req.destroy(new Error('请求超时'));
      });
      req.on('error', reject);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// 从HTML中分析库存字段（关键词匹配 + 片段返回）
function analyzeInventoryFromHtml(html) {
  const lower = html.toLowerCase();
  const keys = [
    'inventory', 'instock', 'inStock', 'stock', 'availability', 'availablequantity', 'availableQty',
    'qty', 'quantity', 'availabilitystatus', 'isinstock', 'available', 'outofstock'
  ];
  const matchedKeys = [];
  const snippets = [];

  keys.forEach(key => {
    const needle = key.toLowerCase();
    let idx = 0; let count = 0; const maxSnippetsPerKey = 3;
    while (true) {
      const found = lower.indexOf(needle, idx);
      if (found === -1) break;
      count++;
      if (snippets.length < 20) {
        const start = Math.max(0, found - 160);
        const end = Math.min(html.length, found + 260);
        const fragment = html.slice(start, end);
        snippets.push({ key, fragment });
      }
      idx = found + needle.length;
      if (count >= maxSnippetsPerKey) break;
    }
    if (count > 0) matchedKeys.push({ key, count });
  });

  const scriptCount = (html.match(/<script/gi) || []).length;
  return { matchedKeys, snippets, scriptCount };
}

// 提取 Arc'teryx 商品页的所有颜色+尺码变体及库存
function extractArcteryxVariants(html) {
  const items = [];
  let mpn = '';

  // 1) 尝试从 JSON-LD schema 中获取 mpn（通常就是 reference）
  try {
    const ldMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of ldMatches) {
      const jsonText = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>[\s\S]*$/, '');
      try {
        const data = JSON.parse(jsonText);
        const product = Array.isArray(data) ? data.find(x => x && x['@type'] === 'Product') : data;
        if (product && product['@type'] === 'Product') {
          if (product.mpn && !mpn) mpn = String(product.mpn);
        }
      } catch (_) {}
    }
  } catch (_) {}

  // 2) 先尝试基于全局映射 + 变体对象块解析
  try {
    const sizeMap = new Map();
    const colourMap = new Map();

    // 收集 sizeId -> sizeLabel
    const sizePairsRegexes = [
      /\"sizeId\"\s*:\s*\"([^\"]+)\"[^\}]{0,300}?\"sizeLabel\"\s*:\s*\"([^\"]+)\"/g,
      /\"sizes\"\s*:\s*\[([^\]]+)\]/g
    ];
    let m;
    while ((m = sizePairsRegexes[0].exec(html)) !== null) {
      const id = String(m[1]).trim();
      const label = String(m[2]).trim();
      if (id && label && !sizeMap.has(id)) sizeMap.set(id, label);
    }
    // 从 sizes 数组中解析 {"id":"...","label":"..."}
    while ((m = sizePairsRegexes[1].exec(html)) !== null) {
      const chunk = m[1];
      const pairRgx = /\"id\"\s*:\s*\"([^\"]+)\"[^\}]{0,120}?\"label\"\s*:\s*\"([^\"]+)\"/g;
      let p;
      while ((p = pairRgx.exec(chunk)) !== null) {
        const id = String(p[1]).trim();
        const label = String(p[2]).trim();
        if (id && label && !sizeMap.has(id)) sizeMap.set(id, label);
      }
    }

    // 收集 colourId -> colourLabel
    const colourPairsRegexes = [
      /\"colourId\"\s*:\s*\"([^\"]+)\"[^\}]{0,300}?\"colourLabel\"\s*:\s*\"([^\"]+)\"/g,
      /\"colours?\"\s*:\s*\[([^\]]+)\]/g
    ];
    while ((m = colourPairsRegexes[0].exec(html)) !== null) {
      const id = String(m[1]).trim();
      const label = String(m[2]).trim();
      if (id && label && !colourMap.has(id)) colourMap.set(id, label);
    }
    while ((m = colourPairsRegexes[1].exec(html)) !== null) {
      const chunk = m[1];
      const pairRgx = /\"colourId\"\s*:\s*\"([^\"]+)\"[^\}]{0,120}?\"colourLabel\"\s*:\s*\"([^\"]+)\"/g;
      let p;
      while ((p = pairRgx.exec(chunk)) !== null) {
        const id = String(p[1]).trim();
        const label = String(p[2]).trim();
        if (id && label && !colourMap.has(id)) colourMap.set(id, label);
      }
    }

    // 扫描变体块：同一对象内包含 id 与 inventory
    const variantRegex = /\{[^{}]*?\"id\"\s*:\s*\"(X\d{6,}?)[^\"]*\"[^{}]*?\"inventory\"\s*:\s*(\-?\d+)[^{}]*?\}/g;
    const colourIdRegex = /\"colourId\"\s*:\s*\"([^\"]+)\"/;
    const colourLabelRegex = /\"colourLabel\"\s*:\s*\"([^\"]+)\"/;
    const sizeLabelRegex = /\"sizeLabel\"\s*:\s*\"([^\"]+)\"/;
    const sizeIdRegex = /\"sizeId\"\s*:\s*\"([^\"]+)\"/;

    let match;
    while ((match = variantRegex.exec(html)) !== null) {
      const idPrefix = match[1];
      const inventory = Number(match[2]);
      const blockStart = Math.max(0, match.index - 1200);
      const blockEnd = Math.min(html.length, variantRegex.lastIndex + 1200);
      const block = html.slice(blockStart, blockEnd);

      // 颜色
      let colour = '';
      let cid = '';
      const c1 = block.match(colourLabelRegex);
      if (c1 && c1[1]) colour = c1[1].trim();
      const c2 = block.match(colourIdRegex);
      if (c2 && c2[1]) cid = c2[1].trim();
      if (!colour && cid && colourMap.has(cid)) colour = colourMap.get(cid);
      if (!colour) {
        const c3 = block.match(/\"colorName\"\s*:\s*\"([^\"]+)\"/);
        if (c3 && c3[1]) colour = c3[1].trim();
      }

      // 尺码
      let size = '';
      let sid = '';
      const s1 = block.match(sizeLabelRegex);
      if (s1 && s1[1]) size = s1[1].trim();
      const s2 = block.match(sizeIdRegex);
      if (s2 && s2[1]) sid = s2[1].trim();
      if (!size && sid && sizeMap.has(sid)) size = sizeMap.get(sid);

      if (idPrefix && colour && size) {
        const reference = mpn || idPrefix;
        const cleanColour = (colour || '').replace(/\s+/g, ' ').replace(/[\/\\]/g, ' ').trim();
        const cleanSize = (size || '').replace(/\s+/g, ' ').trim();
        const sku = [reference, cleanColour, cleanSize].filter(Boolean).join('_');
        items.push({ sku, inventory });
      }
    }
  } catch (_) {}

  // 2) 以 inventory 为锚点进行邻近解析，提升鲁棒性
  try {
    const lower = html.toLowerCase();
    let cursor = 0;
    const seen = new Set();
    while (true) {
      const pos = lower.indexOf('"inventory"', cursor);
      if (pos === -1) break;
      cursor = pos + 10;
      const start = Math.max(0, pos - 2500);
      const end = Math.min(html.length, pos + 2500);
      const block = html.slice(start, end);

      const invMatch = block.match(/\"inventory\"\s*:\s*(\-?\d+)/);
      const inventory = invMatch ? Number(invMatch[1]) : 0;

      const idMatch = block.match(/\"id\"\s*:\s*\"(X\d{6,}?)(?:[^\"]*)\"/);
      const idPrefix = idMatch ? idMatch[1] : '';

      let colour = '';
      const c1 = block.match(/\"colourLabel\"\s*:\s*\"([^\"]+)\"/);
      if (c1 && c1[1]) colour = c1[1].trim();
      if (!colour) {
        const c2 = block.match(/\"colorName\"\s*:\s*\"([^\"]+)\"/);
        if (c2 && c2[1]) colour = c2[1].trim();
      }

      let size = '';
      const s1 = block.match(/\"sizeLabel\"\s*:\s*\"([^\"]+)\"/);
      if (s1 && s1[1]) size = s1[1].trim();
      if (!size) {
        const s2 = block.match(/\"size\"\s*:\s*\"([^\"]+)\"/);
        if (s2 && s2[1]) size = s2[1].trim();
      }

      if (idPrefix && colour && size) {
        const reference = mpn || idPrefix;
        const cleanColour = (colour || '').replace(/\s+/g, ' ').replace(/[\/\\]/g, ' ').trim();
        const cleanSize = (size || '').replace(/\s+/g, ' ').trim();
        const sku = [reference, cleanColour, cleanSize].filter(Boolean).join('_');
        if (!seen.has(sku)) {
          seen.add(sku);
          items.push({ sku, inventory });
        }
      }
    }
  } catch (_) {}

  // 去重（相同 sku 保留库存数值较大的，或最新一个）
  const map = new Map();
  for (const it of items) {
    const key = it.sku;
    if (!map.has(key)) map.set(key, it);
    else if (Number(it.inventory) > Number(map.get(key).inventory)) map.set(key, it);
  }

  return { mpn, items: Array.from(map.values()) };
}

function getCell(row, ...keys) {
  for (const key of keys) {
    for (const k in row) {
      // 去除所有空格、全角空格、不可见字符，忽略大小写
      const cleanK = k.replace(/[\s\u3000\u200B\uFEFF]/g, '').toLowerCase();
      const cleanKey = key.replace(/[\s\u3000\u200B\uFEFF]/g, '').toLowerCase();
      if (cleanK === cleanKey) {
        return row[k];
      }
    }
  }
  // 兜底：返回第一个非空字段
  const values = Object.values(row).filter(v => v !== undefined && v !== null && v !== '');
  return values.length > 0 ? values[0] : '';
}

function convertTmallRowsToWideTable(rows) {
  // 打印表头和每一行内容，便于调试
  if (rows.length > 0) {
    console.log('【调试】表头keys:', Object.keys(rows[0]));
  }
  rows.forEach((row, idx) => {
    console.log(`【调试】第${idx+2}行内容:`, row);
  });
  // 新逻辑：直接返回明细行，不聚合
  return rows.map((row, idx) => {
    return {
      '系统履约单号': getCell(row, '系统履约单号', '履约单号', '订单编号'),
      '店铺订单时间': getCell(row, '店铺订单时间', '门店订单时间', '订单时间', '下单时间', 'date', '时间'),
      'SKU': getCell(row, 'SKU', 'sku', '商品SKU'),
      '商品数量': parseInt(getCell(row, '商品数量', '数量', '商品数', 'qty', '数量（件）') || 1)
    };
  });
} 
