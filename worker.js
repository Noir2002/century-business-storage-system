// 简化的Cloudflare Workers - 专注于Excel文件上传到R2
// 轻量级内存缓存：用于在同一 Worker 实例中暂存"宽表"数据，便于上传后即时刷新

// Excel处理函数（简化版，不依赖外部库）
function arrayToExcelBuffer(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('数据为空或格式错误');
  }

  // 获取所有列名
  const columns = new Set();
  data.forEach(row => {
    Object.keys(row).forEach(key => columns.add(key));
  });
  const columnList = Array.from(columns);

  // 创建CSV内容（简单替代方案）
  let csvContent = columnList.join(',') + '\n';

  data.forEach(row => {
    const values = columnList.map(col => {
      const value = row[col];
      if (value === null || value === undefined) return '';
      return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : String(value);
    });
    csvContent += values.join(',') + '\n';
  });

  // 返回UTF-8编码的Buffer
  return new TextEncoder().encode(csvContent).buffer;
}

// 解析CSV文本为数组对象
function parseCSVToArray(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    return [];
  }

  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    return [];
  }

  // 第一行是标题
  const headers = parseCSVLine(lines[0]);
  if (headers.length === 0) {
    return [];
  }

  const result = [];

  // 处理数据行
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // 尝试转换为数字或保持字符串
        if (value === '') {
          row[header] = '';
        } else if (!isNaN(value) && value !== '') {
          // 检查是否为整数
          if (value.indexOf('.') === -1) {
            row[header] = parseInt(value, 10);
          } else {
            row[header] = parseFloat(value);
          }
        } else {
          row[header] = value;
        }
      });
      result.push(row);
    }
  }

  return result;
}

// 解析CSV行，处理引号和逗号
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 双引号转义
        current += '"';
        i++; // 跳过下一个引号
      } else {
        // 开始或结束引号
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // 字段分隔符
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // 添加最后一个字段
  result.push(current);

  return result;
}

let wideTableCache = [];
let tmallWideCache = [];
const WIDE_TABLE_R2_KEY = 'wide/latest.json';
const WIDE_TABLE_EXCEL_R2_KEY = 'wide/latest.xlsx';
const TMALL_WIDE_R2_KEY = 'tmall/wide.json';
const TMALL_WIDE_EXCEL_R2_KEY = 'tmall/wide.xlsx';

// 工具：获取日期键（YYYY-MM-DD）
function getDateKeysFromRow(row) {
  return Object.keys(row || {}).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
}

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// 计算销量：根据"初始库存"和各日期库存列计算 "日期_销量" 列
function computeSalesForWideTableRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    const dateKeys = getDateKeysFromRow(row).sort();
    if (dateKeys.length === 0) return row;
    const initial = parseInt(row['初始库存'] || 0) || 0;
    let prevStock = initial;
    dateKeys.forEach((k, idx) => {
      const currStock = parseInt(row[k] || 0) || 0;
      let sales = 0;
      if (idx === 0) {
        sales = Math.max(0, prevStock - currStock);
      } else {
        sales = Math.max(0, prevStock - currStock);
      }
      row[k + '_销量'] = sales;
      prevStock = currStock;
    });
    return row;
  });
}

// 智能匹配列名函数 - 支持新旧格式
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

// 转换天猫订单行数据为宽表格式 - 支持新格式
function convertTmallRowsToWideTable(rows) {
  console.log('【调试】表头keys:', Object.keys(rows[0] || {}));
  rows.forEach((row, idx) => {
    console.log(`【调试】第${idx+2}行内容:`, row);
  });

  return rows.map((row, idx) => {
    return {
      '店铺订单时间': getCell(row, '店铺订单时间', '门店订单时间', '订单时间', '下单时间', 'date', '时间') || '',
      'SKU': getCell(row, 'SKU', 'sku', '商品SKU'),
      '尺码': getCell(row, '尺码', 'Size', 'size', '规格'),
      '标题': getCell(row, '标题', '商品标题', '产品标题', '商品名称'),
      '商品数量': parseInt(getCell(row, '商品数量', '数量', '商品数', 'qty', '数量（件）') || 1),
      '商品单价': parsePrice(getCell(row, '商品单价', '单价', '价格', 'Price', 'price') || 0),
      '订单金额': parsePrice(getCell(row, '订单金额', '金额', '总价', '总金额', 'Amount', 'amount') || 0)
    };
  });
}

// 解析价格字符串，移除货币符号并转换为数字
function parsePrice(priceStr) {
  if (!priceStr || priceStr === '') return 0;
  let cleanedStr = String(priceStr).trim();

  // 移除常见货币符号 (€, $, ¥, £, ￥等) - 包括前缀和后缀
  cleanedStr = cleanedStr.replace(/^[\s\u20AC\u24\u00A2\u00A3\u00A5\uFFE5$€¥£]+|[\s\u20AC\u24\u00A2\u00A3\u00A5\uFFE5$€¥£]+$/g, '');

  // 检测是否是纯数字（整数或小数）
  if (/^\d+(\.\d+)?$/.test(cleanedStr)) {
    const num = parseFloat(cleanedStr);
    return isNaN(num) ? 0 : num;
  }

  // 处理欧洲格式 (402,50) - 最后一个逗号后面有1-3位数字
  const lastCommaIndex = cleanedStr.lastIndexOf(',');
  if (lastCommaIndex !== -1) {
    const afterLastComma = cleanedStr.substring(lastCommaIndex + 1);
    if (afterLastComma.length >= 1 && afterLastComma.length <= 3 && /^\d+$/.test(afterLastComma)) {
      // 欧洲格式：将最后一个逗号转换为小数点
      cleanedStr = cleanedStr.substring(0, lastCommaIndex) + '.' + afterLastComma;
    } else {
      // 千分位分隔符：移除所有逗号
      cleanedStr = cleanedStr.replace(/,/g, '');
    }
  }

  // 移除所有点（如果还有的话）
  cleanedStr = cleanedStr.replace(/\./g, '');

  // 转换为数字
  const num = parseFloat(cleanedStr);
  return isNaN(num) ? 0 : num;
}

// 获取文件扩展名
function getFileExtension(fileName) {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot !== -1 ? fileName.substring(lastDot + 1) : 'xlsx';
}

// 验证Excel文件
function isExcelFile(file) {
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/excel',
    'application/x-excel'
  ];

  const allowedExtensions = ['.xlsx', '.xls'];
  const fileName = file.name.toLowerCase();

  return allowedTypes.includes(file.type) ||
         allowedExtensions.some(ext => fileName.endsWith(ext));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // 处理CORS预检请求
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders
      });
    }

    try {
      // 路由处理：仅当 /api/ 前缀时进入 API 分发
      if (path.startsWith('/api/')) {
        if (path === '/api/health' && (method === 'GET' || method === 'HEAD')) {
          return Response.json({ success: true, service: 'worker', time: new Date().toISOString() }, { headers: corsHeaders });
        } else if (path === '/api/files/upload' && method === 'POST') {
          return await handleExcelUpload(request, env, corsHeaders);
        } else if (path.startsWith('/api/localdb/')) {
          return await handleLocalDB(request, env, path, method, corsHeaders);
        } else if (path.startsWith('/api/tmall-orders/')) {
          return await handleTmallOrders(request, env, path, method, corsHeaders);
        } else if (path.startsWith('/api/r2/')) {
          return await handleR2API(request, env, path, method, corsHeaders);
        } else if (path.startsWith('/api/database/')) {
          return await handleDatabaseAPI(request, env, path, method, corsHeaders);
        } else if (path.startsWith('/api/package')) {
          return await handlePackageAPI(request, env, path, method, corsHeaders);
        } else {
          return new Response('Not Found', { status: 404, headers: corsHeaders });
        }
      }

      // 非 /api/ 的请求，交给静态资产（Sites），同时补充CORS响应头
      if (env.ASSETS && env.ASSETS.fetch) {
        const resp = await env.ASSETS.fetch(request);
        const headers = new Headers(resp.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
      }

      // 兜底
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Worker Error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// 处理Excel文件上传
async function handleExcelUpload(request, env, corsHeaders) {
  console.log('🔄 处理Excel文件上传...');

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const description = formData.get('description') || '';

    if (!file) {
      return Response.json({
        success: false,
        error: '没有上传文件'
      }, { headers: corsHeaders });
    }

    // 验证文件类型
    if (!isExcelFile(file)) {
      return Response.json({
        success: false,
        error: '只支持Excel文件(.xlsx, .xls)'
      }, { headers: corsHeaders });
    }

    // 生成文件名
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1E9);
    const fileExtension = getFileExtension(file.name);
    const fileName = `${timestamp}-${randomSuffix}.${fileExtension}`;
    const filePath = `arc/${fileName}`;

    console.log(`📁 上传文件路径: ${filePath}`);

    // 上传到R2
    if (env.R2_BUCKET) {
      console.log('📦 使用R2 Bucket上传...');
      await env.R2_BUCKET.put(filePath, file.stream(), {
        httpMetadata: {
          contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        customMetadata: {
          originalName: file.name,
          uploadTime: new Date().toISOString(),
          description: description
        }
      });
    } else {
      throw new Error('R2存储桶不可用');
    }

    // 构建文件信息
    const fileInfo = {
      id: timestamp,
      originalName: file.name,
      fileName: fileName,
      size: file.size,
      uploadTime: new Date().toISOString(),
      uploadedBy: 'admin',
      description: description,
      r2Path: filePath,
      publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${filePath}`
    };

    console.log('✅ 文件上传成功:', fileInfo);

    return Response.json({
      success: true,
      message: '文件上传成功',
      file: fileInfo
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 文件上传失败:', error);
    return Response.json({
      success: false,
      error: `文件上传失败: ${error.message}`
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}

// 处理打包系统用到的R2 API（目录/上传/列出/删除/公共URL）
async function handleR2API(request, env, path, method, corsHeaders) {
  if (!env.R2_BUCKET) {
    return Response.json({ success: false, error: 'R2 Bucket 未配置' }, { status: 500, headers: corsHeaders });
  }

  try {
    // 列出文件：/api/r2/list-files?folder=package&prefix=2025-10/02&limit=1000
    if (path === '/api/r2/list-files' && method === 'GET') {
      const url = new URL(request.url);
      const folder = url.searchParams.get('folder') || '';
      const prefix = url.searchParams.get('prefix') || '';
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const realPrefix = folder ? `${folder}/${prefix}`.replace(/\/$/, '') : prefix;

      const { objects } = await env.R2_BUCKET.list({ prefix: realPrefix || undefined, limit });
      const files = (objects || []).map(obj => ({ key: obj.key, size: obj.size, uploaded: obj.uploaded ? new Date(obj.uploaded).toISOString() : null }));
      return Response.json({ success: true, files }, { headers: corsHeaders });
    }

    // 删除文件：/api/r2/delete/:key
    if (path.startsWith('/api/r2/delete/') && method === 'DELETE') {
      const key = decodeURIComponent(path.replace('/api/r2/delete/', ''));
      await env.R2_BUCKET.delete(key);
      return Response.json({ success: true, message: `已删除 ${key}` }, { headers: corsHeaders });
    }

    // 获取公共URL：/api/r2/public-url/:key?folder=package
    if (path.startsWith('/api/r2/public-url/') && method === 'GET') {
      const url = new URL(request.url);
      const folder = url.searchParams.get('folder') || '';
      const keyPart = decodeURIComponent(path.replace('/api/r2/public-url/', ''));
      const key = folder ? `${folder}/${keyPart}` : keyPart;
      // 直接返回 R2 公共域的URL（需在 R2 侧配置公开访问或经CF代理）
      const publicUrl = `https://century-business-system.23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/${key}`;
      return Response.json({ success: true, url: publicUrl }, { headers: corsHeaders });
    }

    // 上传文件（multipart）：/api/r2/upload/:folder/:subpath... (保持完整层级)
    if (path.startsWith('/api/r2/upload/') && method === 'POST') {
      const folderAndPath = decodeURIComponent(path.replace('/api/r2/upload/', '')); // e.g. package/2025-10/2025-10-02/file.ext 或 database/YYYY-MM/YYYY-MM-DD.xlsx
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) {
        return Response.json({ success: false, error: '缺少文件' }, { headers: corsHeaders });
      }

      await env.R2_BUCKET.put(folderAndPath, file.stream(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
        customMetadata: { uploadedAt: new Date().toISOString() }
      });

      return Response.json({ success: true, message: '上传成功', filePath: folderAndPath, size: file.size }, { headers: corsHeaders });
    }

    // 测试连接
    if (path === '/api/r2/test-connection' && method === 'GET') {
      const { objects } = await env.R2_BUCKET.list({ limit: 1 });
      return Response.json({ success: true, message: 'R2 可用', sample: (objects && objects[0]) ? objects[0].key : null }, { headers: corsHeaders });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });

  } catch (error) {
    console.error('R2 API 错误:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// 数据库（打包系统）共享接口
async function handleDatabaseAPI(request, env, path, method, corsHeaders) {
  if (!env.R2_BUCKET) {
    return Response.json({ success: false, error: 'R2 Bucket 未配置' }, { status: 500, headers: corsHeaders });
  }

  try {
    // 获取最新数据库 JSON
    if (path === '/api/database/latest' && method === 'GET') {
      const obj = await env.R2_BUCKET.get('database/latest.json');
      if (!obj) {
        return Response.json({ success: false, error: '暂无共享数据库' }, { status: 404, headers: corsHeaders });
      }
      const text = await obj.text();
      const json = JSON.parse(text);
      return Response.json({ success: true, ...json }, { headers: corsHeaders });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error('Database API 错误:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// 处理本地数据库API请求
async function handleLocalDB(request, env, path, method, corsHeaders) {
  console.log('🔄 处理本地数据库请求:', path);
  
  try {
    // 宽表相关API
    if (path === '/api/localdb/wide' && method === 'GET') {
      // 返回宽表数据：优先内存；若为空则尝试从R2读取并缓存（优先Excel格式）
      let data = Array.isArray(wideTableCache) ? wideTableCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try {
          // 优先尝试读取Excel格式
          let excelObj = await env.R2_BUCKET.get(WIDE_TABLE_EXCEL_R2_KEY);
          if (excelObj) {
            const csvText = await excelObj.text();
            data = parseCSVToArray(csvText);
            if (Array.isArray(data) && data.length > 0) {
              wideTableCache = data;
              console.log('✅ 从Excel文件加载宽表数据成功:', data.length, '条记录');
            }
          } else {
            // 如果没有Excel文件，回退到JSON格式
            const jsonObj = await env.R2_BUCKET.get(WIDE_TABLE_R2_KEY);
            if (jsonObj) {
              const text = await jsonObj.text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              wideTableCache = parsed;
              data = parsed;
              }
            }
          }
        } catch (e) { console.warn('读取R2宽表失败:', e); }
      }

      // 确保数据不为null或undefined
      data = Array.isArray(data) ? data : [];
      wideTableCache = data;

      // 读取后计算销量列（不归档，避免破坏前端列结构）
      wideTableCache = computeSalesForWideTableRows(wideTableCache);
      data = wideTableCache;

      return Response.json({ success: true, data, total: data.length }, { headers: corsHeaders });
    }
    
    else if (path === '/api/localdb/wide' && method === 'POST') {
      // 保存宽表数据
      const requestData = await request.json();
      console.log('💾 保存宽表数据:', requestData);
      if (requestData && Array.isArray(requestData.data)) {
        wideTableCache = requestData.data;
        
        // 计算销量
        wideTableCache = computeSalesForWideTableRows(wideTableCache);
        
        // 持久化到R2（JSON和Excel格式）- 只保存宽表数据
        if (env.R2_BUCKET) {
          try {
            // 保存JSON格式
            await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), {
              httpMetadata: { contentType: 'application/json' },
              customMetadata: { updatedAt: new Date().toISOString() }
            });
            
            // 保存Excel格式
            if (wideTableCache.length > 0) {
              const excelBuffer = arrayToExcelBuffer(wideTableCache);
              await env.R2_BUCKET.put(WIDE_TABLE_EXCEL_R2_KEY, excelBuffer, {
                httpMetadata: { contentType: 'text/csv; charset=utf-8' },
                customMetadata: { updatedAt: new Date().toISOString() }
              });
            }
            
            console.log('✅ 宽表数据已持久化到R2:', wideTableCache.length, '行');
          } catch (e) { 
            console.warn('写入R2失败:', e); 
          }
        }
      }
      return Response.json({
        success: true,
        message: '宽表数据保存成功',
        wideTableCount: wideTableCache.length
      }, { headers: corsHeaders });
    }
    
    else if (path === '/api/localdb/wide/export' && method === 'GET') {
      // 导出宽表数据：优先从Excel文件导出
      let data = Array.isArray(wideTableCache) ? wideTableCache : [];

      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try {
          // 优先尝试读取Excel格式
          const excelObj = await env.R2_BUCKET.get(WIDE_TABLE_EXCEL_R2_KEY);
          if (excelObj) {
            const csvText = await excelObj.text();
            data = parseCSVToArray(csvText);
            console.log('✅ 从Excel文件导出宽表数据成功:', data.length, '条记录');
          } else {
            // 如果没有Excel文件，回退到JSON格式
            const jsonObj = await env.R2_BUCKET.get(WIDE_TABLE_R2_KEY);
            if (jsonObj) {
              const text = await jsonObj.text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              data = parsed;
              }
            }
          }
        } catch (e) { console.warn('读取R2宽表失败:', e); }
      }

      if (data.length === 0) {
        return Response.json({ success: false, error: '没有数据可导出' }, { status: 404, headers: corsHeaders });
      }

      // 生成Excel文件并返回
      try {
        const excelBuffer = arrayToExcelBuffer(data);
        const headers = new Headers(corsHeaders);
        headers.set('Content-Type', 'text/csv; charset=utf-8');
        headers.set('Content-Disposition', 'attachment; filename="inventory-data.csv"');

        return new Response(excelBuffer, { headers });
      } catch (error) {
        console.error('生成Excel文件失败:', error);
        return Response.json({ success: false, error: '导出失败: ' + error.message }, { status: 500, headers: corsHeaders });
      }
    }
    
    else if (path === '/api/localdb/wide/batch' && method === 'POST') {
      // 批量上传处理 - 支持文件上传和JSON数据
      try {
        const contentType = request.headers.get('content-type') || '';
        
        if (contentType.includes('multipart/form-data')) {
          // 处理文件直传：当前不在服务端解析Excel，提示前端改为JSON上传
          const formData = await request.formData();
          const file = formData.get('file');
          if (!file) {
            return Response.json({ success: false, error: '没有上传文件' }, { headers: corsHeaders });
          }
          console.log('📤 收到Excel文件直传(不解析):', file.name);
          return Response.json({ success: true, message: `文件 ${file.name} 已接收；请在前端解析后以JSON提交`, processed: 0, data: [] }, { headers: corsHeaders });
          
        } else {
          // 处理JSON数据
          const requestData = await request.json();
          console.log('📤 批量JSON数据:', requestData);
          if (requestData && Array.isArray(requestData.data)) {
            let processedData = requestData.data;

            // 如果数据看起来是原始的Excel行数据（包含标题、尺码等新字段），进行转换
            if (requestData.data.length > 0 && requestData.data[0].hasOwnProperty('标题')) {
              console.log('🔄 检测到新格式Excel数据，正在转换...');
              processedData = convertTmallRowsToWideTable(requestData.data);
              console.log('✅ 数据转换完成:', processedData.length, '条记录');
            }

            wideTableCache = processedData;
            // 计算销量并持久化到R2（JSON和Excel格式）
            wideTableCache = computeSalesForWideTableRows(wideTableCache);
            if (env.R2_BUCKET) {
              try {
                // 保存JSON格式
                await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), {
                  httpMetadata: { contentType: 'application/json' },
                  customMetadata: { updatedAt: new Date().toISOString() }
                });

                // 保存Excel格式
                if (wideTableCache.length > 0) {
                  const excelBuffer = arrayToExcelBuffer(wideTableCache);
                  await env.R2_BUCKET.put(WIDE_TABLE_EXCEL_R2_KEY, excelBuffer, {
                    httpMetadata: { contentType: 'text/csv; charset=utf-8' },
                    customMetadata: { updatedAt: new Date().toISOString() }
                  });
                }
              } catch (e) { console.warn('写入R2宽表失败:', e); }
            }
            // 不自动归档，保持列结构不变
          }

          return Response.json({ success: true, message: '宽表数据上传成功', processed: requestData.data ? requestData.data.length : 0, data: Array.isArray(wideTableCache) ? wideTableCache : [] }, { headers: corsHeaders });
        }
        
      } catch (parseError) {
        console.error('批量上传解析错误:', parseError);
        return Response.json({
          success: false,
          error: `数据解析失败: ${parseError.message}`
        }, { 
          status: 400,
          headers: corsHeaders 
        });
      }
    }
    
    else if (path === '/api/localdb/wide/clear-all' && (method === 'POST' || method === 'GET')) {
      // 清空缓存并返回成功；支持 POST/GET 方便浏览器直接验证
      wideTableCache = [];
      if (env.R2_BUCKET) {
        try { await env.R2_BUCKET.delete(WIDE_TABLE_R2_KEY); } catch (e) { console.warn('删除R2宽表失败:', e); }
      }
      return Response.json({ success: true, message: '成功清空所有宽表数据' }, { headers: corsHeaders });
    }
    
    // 注意：用户要求只使用宽表模式，所有行记录相关API已被移除
    
    else {
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
    
  } catch (error) {
    console.error('❌ LocalDB API错误:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { 
      status: 500,
      headers: corsHeaders 
    });
  }
}

// 处理天猫订单API请求 - 独立的天猫宽表数据存储
async function handleTmallOrders(request, env, path, method, corsHeaders) {
  console.log('🔄 处理天猫订单请求:', path);

  try {
    // GET 天猫宽表
    if (path === '/api/tmall-orders/wide' && method === 'GET') {
      let data = Array.isArray(tmallWideCache) ? tmallWideCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try {
          // 优先尝试读取Excel(CSV)格式
          const excelObj = await env.R2_BUCKET.get(TMALL_WIDE_EXCEL_R2_KEY);
          if (excelObj) {
            const csvText = await excelObj.text();
            data = parseCSVToArray(csvText);
            if (Array.isArray(data) && data.length > 0) {
              tmallWideCache = data;
              console.log('✅ 从Excel文件加载天猫宽表数据成功:', data.length, '条记录');
            }
          } else {
            // 回退到JSON格式
            const jsonObj = await env.R2_BUCKET.get(TMALL_WIDE_R2_KEY);
            if (jsonObj) {
              const text = await jsonObj.text();
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed)) {
                tmallWideCache = parsed;
                data = parsed;
              }
            }
          }
        } catch (e) { console.warn('读取R2天猫宽表失败:', e); }
      }

      data = Array.isArray(data) ? data : [];
      tmallWideCache = data;
      return Response.json({ success: true, data, total: data.length }, { headers: corsHeaders });
    }

    // POST 保存天猫宽表
    else if (path === '/api/tmall-orders/wide' && method === 'POST') {
      const requestData = await request.json();
      console.log('💾 保存天猫宽表数据:', requestData);
      if (requestData && Array.isArray(requestData.data)) {
        tmallWideCache = requestData.data;

        if (env.R2_BUCKET) {
          try {
            await env.R2_BUCKET.put(TMALL_WIDE_R2_KEY, JSON.stringify(tmallWideCache), {
              httpMetadata: { contentType: 'application/json' },
              customMetadata: { updatedAt: new Date().toISOString() }
            });

            if (tmallWideCache.length > 0) {
              const excelBuffer = arrayToExcelBuffer(tmallWideCache);
              await env.R2_BUCKET.put(TMALL_WIDE_EXCEL_R2_KEY, excelBuffer, {
                httpMetadata: { contentType: 'text/csv; charset=utf-8' },
                customMetadata: { updatedAt: new Date().toISOString() }
              });
            }
            console.log('✅ 天猫宽表数据已持久化到R2:', tmallWideCache.length, '行');
          } catch (e) { console.warn('写入R2天猫宽表失败:', e); }
        }
      }
      return Response.json({ success: true, message: '天猫宽表数据保存成功', count: tmallWideCache.length }, { headers: corsHeaders });
    }

    // 批量上传天猫宽表
    else if (path === '/api/tmall-orders/wide/batch' && method === 'POST') {
      try {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('multipart/form-data')) {
          const formData = await request.formData();
          const file = formData.get('file');
          if (!file) {
            return Response.json({ success: false, error: '没有上传文件' }, { headers: corsHeaders });
          }
          console.log('📤 收到天猫Excel文件直传(不解析):', file.name);
          return Response.json({ success: true, message: `文件 ${file.name} 已接收；请在前端解析后以JSON提交`, processed: 0, data: [] }, { headers: corsHeaders });
        } else {
          const requestData = await request.json();
          console.log('📤 天猫批量JSON数据:', requestData);
          if (requestData && Array.isArray(requestData.data)) {
            tmallWideCache = requestData.data;
            if (env.R2_BUCKET) {
              try {
                await env.R2_BUCKET.put(TMALL_WIDE_R2_KEY, JSON.stringify(tmallWideCache), {
                  httpMetadata: { contentType: 'application/json' },
                  customMetadata: { updatedAt: new Date().toISOString() }
                });

                if (tmallWideCache.length > 0) {
                  const excelBuffer = arrayToExcelBuffer(tmallWideCache);
                  await env.R2_BUCKET.put(TMALL_WIDE_EXCEL_R2_KEY, excelBuffer, {
                    httpMetadata: { contentType: 'text/csv; charset=utf-8' },
                    customMetadata: { updatedAt: new Date().toISOString() }
                  });
                }
              } catch (e) { console.warn('写入R2天猫宽表失败:', e); }
            }
          }
          return Response.json({ success: true, message: '天猫宽表数据上传成功', processed: requestData.data ? requestData.data.length : 0, data: Array.isArray(tmallWideCache) ? tmallWideCache : [] }, { headers: corsHeaders });
        }
      } catch (parseError) {
        console.error('天猫批量上传解析错误:', parseError);
        return Response.json({ success: false, error: `数据解析失败: ${parseError.message}` }, { status: 400, headers: corsHeaders });
      }
    }

    // 导出天猫宽表
    else if (path === '/api/tmall-orders/wide/export' && method === 'GET') {
      let data = Array.isArray(tmallWideCache) ? tmallWideCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try {
          const excelObj = await env.R2_BUCKET.get(TMALL_WIDE_EXCEL_R2_KEY);
          if (excelObj) {
            const csvText = await excelObj.text();
            data = parseCSVToArray(csvText);
            console.log('✅ 从Excel文件导出天猫宽表数据成功:', data.length, '条记录');
          } else {
            const jsonObj = await env.R2_BUCKET.get(TMALL_WIDE_R2_KEY);
            if (jsonObj) {
              const text = await jsonObj.text();
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed)) {
                data = parsed;
              }
            }
          }
        } catch (e) { console.warn('读取R2天猫宽表失败:', e); }
      }

      if (data.length === 0) {
        return Response.json({ success: false, error: '没有数据可导出' }, { status: 404, headers: corsHeaders });
      }

      try {
        const excelBuffer = arrayToExcelBuffer(data);
        const headers = new Headers(corsHeaders);
        headers.set('Content-Type', 'text/csv; charset=utf-8');
        headers.set('Content-Disposition', 'attachment; filename="tmall-orders.csv"');
        return new Response(excelBuffer, { headers });
      } catch (error) {
        console.error('生成天猫导出文件失败:', error);
        return Response.json({ success: false, error: '导出失败: ' + error.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 清空天猫宽表
    else if (path === '/api/tmall-orders/wide/clear-all' && (method === 'POST' || method === 'GET')) {
      tmallWideCache = [];
      if (env.R2_BUCKET) {
        try { await env.R2_BUCKET.delete(TMALL_WIDE_R2_KEY); } catch (e) { console.warn('删除R2天猫宽表失败:', e); }
        try { await env.R2_BUCKET.delete(TMALL_WIDE_EXCEL_R2_KEY); } catch (e) { console.warn('删除R2天猫宽表Excel失败:', e); }
      }
      return Response.json({ success: true, message: '成功清空所有天猫宽表数据' }, { headers: corsHeaders });
    }

    // 智能导入别名
    else if (path === '/api/tmall-orders/smart-import' && method === 'POST') {
      // 与 batch 行为一致（前端已解析为JSON）
      return await handleTmallOrders(new Request(new URL('/api/tmall-orders/wide/batch', request.url), { method: 'POST', headers: request.headers, body: request.body }), env, '/api/tmall-orders/wide/batch', 'POST', corsHeaders);
    }

    else {
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

  } catch (error) {
    console.error('❌ 天猫订单API错误:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// 打包系统API处理器
async function handlePackageAPI(request, env, path, method, corsHeaders) {
  if (!env.R2_BUCKET) {
    return Response.json({ success: false, error: 'R2 Bucket 未配置' }, { status: 500, headers: corsHeaders });
  }

  try {
    // 获取打包系统的文件列表
    if (path === '/api/package/files' && method === 'GET') {
      try {
        // 获取package文件夹下的所有文件
        const { objects } = await env.R2_BUCKET.list({ prefix: 'package/' });

        if (!objects || objects.length === 0) {
          return Response.json({ success: true, files: [] }, { headers: corsHeaders });
        }

        // 转换文件信息格式
        const files = objects.map(obj => {
          const key = obj.key;
          const pathParts = key.split('/');

          // 解析路径：package/YYYY-MM/YYYY-MM-DD/YYYY-MM-DD-履约单号/filename.ext
          let folder = '';
          let lpNumber = '';
          let contractNumber = '';
          let r2Path = key;

          if (pathParts.length >= 4) {
            const yearMonth = pathParts[1]; // YYYY-MM
            const yearMonthDay = pathParts[2]; // YYYY-MM-DD
            const folderName = pathParts[3]; // YYYY-MM-DD-履约单号

            folder = `package/${yearMonth}/${yearMonthDay}/${folderName}`;

            // 从文件夹名称中提取履约单号（支持多种格式）
            const contractMatch = folderName.match(/(\d{4}-\d{2}-\d{2}-)?(.+)/);
            if (contractMatch) {
              lpNumber = contractMatch[2] || folderName;
              contractNumber = lpNumber;
            }
          }

          return {
            fileName: pathParts[pathParts.length - 1],
            filePath: folder,
            r2Path: key,
            size: obj.size || 0,
            uploaded: obj.uploaded || new Date().toISOString(),
            lpNumber: lpNumber,
            contractNumber: contractNumber,
            folder: folder
          };
        });

        console.log(`📁 返回打包系统文件列表: ${files.length} 个文件`);
        return Response.json({ success: true, files }, { headers: corsHeaders });

      } catch (error) {
        console.error('获取打包系统文件列表失败:', error);
        return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 文件数据同步 - POST（保存文件记录到R2）
    if (path === '/api/package-sync/files' && method === 'POST') {
      try {
        const syncData = await request.json();

        if (!syncData || !syncData.files) {
          return Response.json({ success: false, error: '无效的同步数据' }, { status: 400, headers: corsHeaders });
        }

        console.log(`📦 接收到文件同步数据: ${Object.keys(syncData.files).length} 个文件记录`);

        // 保存文件记录到R2（持久化）
        const saveKey = 'package-sync/files.json';
        const saveData = {
          ...syncData,
          lastSync: new Date().toISOString(),
          timestamp: Date.now()
        };

        await env.R2_BUCKET.put(saveKey, JSON.stringify(saveData), {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { updatedAt: new Date().toISOString() }
        });

        console.log(`✅ 文件记录已保存到R2: ${saveKey}`);

        return Response.json({
          success: true,
          message: '文件记录已同步并保存',
          receivedFiles: Object.keys(syncData.files).length,
          timestamp: saveData.timestamp
        }, { headers: corsHeaders });

      } catch (error) {
        console.error('文件同步失败:', error);
        return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 文件数据同步 - GET（从R2读取文件记录）
    if (path === '/api/package-sync/files' && method === 'GET') {
      try {
        const loadKey = 'package-sync/files.json';
        const obj = await env.R2_BUCKET.get(loadKey);

        if (!obj) {
          return Response.json({ 
            success: false, 
            data: null, 
            message: '暂无文件同步数据' 
          }, { headers: corsHeaders });
        }

        const data = JSON.parse(await obj.text());
        console.log(`📥 从R2加载文件记录: ${Object.keys(data.files || {}).length} 个文件`);

        return Response.json({
          success: true,
          data: data
        }, { headers: corsHeaders });

      } catch (error) {
        console.error('读取文件同步数据失败:', error);
        return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 数据库数据同步 - POST（保存数据到R2）
    if (path === '/api/package-sync/database' && method === 'POST') {
      try {
        const syncData = await request.json();

        if (!syncData || !syncData.data) {
          return Response.json({ success: false, error: '无效的数据库同步数据' }, { status: 400, headers: corsHeaders });
        }

        console.log(`💾 接收到数据库同步数据: ${Object.keys(syncData.data).length} 个记录`);

        // 保存到R2存储（持久化）
        const saveKey = 'package-sync/database.json';
        const saveData = {
          ...syncData,
          lastSync: new Date().toISOString(),
          timestamp: Date.now()
        };

        await env.R2_BUCKET.put(saveKey, JSON.stringify(saveData), {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { updatedAt: new Date().toISOString() }
        });

        console.log(`✅ 数据库已保存到R2: ${saveKey}`);

        return Response.json({
          success: true,
          message: '数据库记录已同步并保存',
          receivedRecords: Object.keys(syncData.data).length,
          timestamp: saveData.timestamp
        }, { headers: corsHeaders });

      } catch (error) {
        console.error('数据库同步失败:', error);
        return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 数据库数据同步 - GET（从R2读取数据）
    if (path === '/api/package-sync/database' && method === 'GET') {
      try {
        const loadKey = 'package-sync/database.json';
        const obj = await env.R2_BUCKET.get(loadKey);

        if (!obj) {
          return Response.json({ 
            success: false, 
            data: null, 
            message: '暂无同步数据' 
          }, { headers: corsHeaders });
        }

        const data = JSON.parse(await obj.text());
        console.log(`📥 从R2加载数据库: ${Object.keys(data.data || {}).length} 个记录`);

        return Response.json({
          success: true,
          data: data
        }, { headers: corsHeaders });

      } catch (error) {
        console.error('读取数据库同步数据失败:', error);
        return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 获取文件的公开下载URL
    if (path.startsWith('/api/package/file/') && path.endsWith('/url') && method === 'GET') {
      try {
        // 从路径中提取文件路径，例如 /api/package/file/package/2025-01/2025-01-01/test.jpg/url
        const pathWithoutApi = path.replace('/api/package/file/', '').replace('/url', '');
        const filePath = decodeURIComponent(pathWithoutApi);

        // 构建R2公开URL
        const publicUrl = `https://century-business-system.23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/${filePath}`;

        return Response.json({
          success: true,
          url: publicUrl,
          filePath: filePath
        }, { headers: corsHeaders });

      } catch (error) {
        console.error('获取文件公开URL失败:', error);
        return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });

  } catch (error) {
    console.error('打包系统API错误:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}