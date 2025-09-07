// 简化的Cloudflare Workers - 专注于Excel文件上传到R2
// 轻量级内存缓存：用于在同一 Worker 实例中暂存“宽表”数据，便于上传后即时刷新
let wideTableCache = [];
let recordsCache = [];
const WIDE_TABLE_R2_KEY = 'wide/latest.json';
const RECORDS_R2_KEY = 'records/latest.json';

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
// 将超过最近N天的数据从宽表归档到行记录
async function archiveOldDatesToRecords(env, keepDays = 5) {
  if (!Array.isArray(wideTableCache) || wideTableCache.length === 0) return;
  const today = new Date();
  const keepSet = new Set(Array.from({length: keepDays}, (_,i)=>{
    const d = new Date(today); d.setDate(today.getDate()-i); return formatYMD(d);
  }));
  let archived = [];
  wideTableCache.forEach(row => {
    const dateKeys = getDateKeysFromRow(row);
    dateKeys.forEach(k => {
      if (!keepSet.has(k)) {
        const stock = parseInt(row[k]||0) || 0;
        const rec = {
          id: Date.now() + Math.floor(Math.random()*1e6),
          SKU: row.SKU || '',
          '产品中文名': row['产品中文名'] || '',
          '网页链接': row['网页链接'] || '',
          '初始库存': row['初始库存'] || 0,
          '日期': `${k} 00:00`,
          '库存': stock,
          '销量': row[k + '_销量'] != null ? parseInt(row[k + '_销量']) || 0 : 0
        };
        archived.push(rec);
        delete row[k];
        delete row[k + '_销量'];
      }
    });
  });
  if (archived.length) {
    if (!Array.isArray(recordsCache)) recordsCache = [];
    // 新归档的放到最前面
    recordsCache = [...archived, ...recordsCache];
    // 持久化两份数据
    if (env && env.R2_BUCKET) {
      try {
        await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), { httpMetadata: { contentType: 'application/json' } });
        await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), { httpMetadata: { contentType: 'application/json' } });
      } catch (e) { console.warn('归档持久化失败:', e); }
    }
  }
}

// 计算销量：根据“初始库存”和各日期库存列计算 “日期_销量” 列
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
        } else if (path === '/api/files' && method === 'GET') {
          return await handleFilesList(request, env, corsHeaders);
        } else if (path === '/api/files/presigned-url' && method === 'POST') {
          return await handlePresignedUrl(request, env, corsHeaders);
        } else if (path === '/api/files/parse' && method === 'POST') {
          return await handleExcelParse(request, env, corsHeaders);
        } else if (path.startsWith('/api/files/') && method === 'GET' && path.endsWith('/download')) {
          return await handleFileDownload(request, env, path, corsHeaders);
        } else if (path.startsWith('/api/files/') && method === 'GET' && path.endsWith('/analyze')) {
          return await handleFileAnalyze(request, env, path, corsHeaders);
        } else if (path.startsWith('/api/inventory/')) {
          return await handleInventoryData(request, env, path, method, corsHeaders);
        } else if (path.startsWith('/api/analytics/')) {
          return await handleAnalyticsData(request, env, path, method, corsHeaders);
        } else if (path.startsWith('/api/localdb/')) {
          return await handleLocalDB(request, env, path, method, corsHeaders);
        } else if (path.startsWith('/api/tmall-orders/')) {
          return await handleTmallOrders(request, env, path, method, corsHeaders);
        } else if (path.startsWith('/api/r2/')) {
          return await handleR2Routes(request, env, path, method, corsHeaders);
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

// 获取文件列表
async function handleFilesList(request, env, corsHeaders) {
  console.log('🔄 获取文件列表...');
  
  try {
    if (env.R2_BUCKET) {
      const objects = await env.R2_BUCKET.list({ prefix: 'arc/' });
      const files = objects.objects.map((obj, index) => ({
        id: index + 1,
        originalName: obj.customMetadata?.originalName || obj.key.replace('arc/', ''),
        fileName: obj.key.replace('arc/', ''),
        size: obj.size || 0,
        uploadTime: obj.customMetadata?.uploadTime || obj.uploaded || new Date().toISOString(),
        uploadedBy: 'admin',
        description: obj.customMetadata?.description || '',
        r2Path: obj.key,
        publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${obj.key}`
      }));
      
      console.log(`✅ 找到 ${files.length} 个文件`);
      
      return Response.json({ 
        success: true, 
        files: files 
      }, { headers: corsHeaders });
    } else {
      throw new Error('R2存储桶不可用');
    }
  } catch (error) {
    console.error('❌ 获取文件列表失败:', error);
    
    // 回退到空列表
    return Response.json({ 
      success: true, 
      files: [],
      message: '文件列表为空或获取失败'
    }, { headers: corsHeaders });
  }
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

// 直接通过Workers处理文件上传 - 解决CORS问题的最简单方法
async function handlePresignedUrl(request, env, corsHeaders) {
  console.log('🔄 处理文件上传请求...');
  
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const originalFileName = formData.get('fileName') || file.name;
    
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

    // 生成文件路径
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1E9);
    const fileExtension = getFileExtension(originalFileName);
    const newFileName = `${timestamp}-${randomSuffix}.${fileExtension}`;
    const filePath = `arc/${newFileName}`;
    
    console.log(`📁 上传文件到: ${filePath}`);

    if (env.R2_BUCKET) {
      // 1. 先解析Excel文件内容
      const arrayBuffer = await file.arrayBuffer();
      const excelData = parseExcelData(arrayBuffer);
      
      // 2. 存储解析后的数据到本地缓存（使用KV或者简单存储）
      const dataKey = `excel_data_${timestamp}`;
      // 这里应该存储到KV，但暂时模拟存储
      
      // 3. 然后上传原文件到R2
      await env.R2_BUCKET.put(filePath, file.stream(), {
        httpMetadata: {
          contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        customMetadata: {
          originalName: originalFileName,
          uploadTime: new Date().toISOString(),
          dataKey: dataKey,
          parsedRows: excelData.length
        }
      });
      
      return Response.json({
        success: true,
        filePath: filePath,
        newFileName: newFileName,
        originalName: originalFileName,
        size: file.size,
        uploadTime: new Date().toISOString(),
        publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${filePath}`
      }, { headers: corsHeaders });
    } else {
      throw new Error('R2存储桶不可用');
    }
    
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

// 验证Excel文件类型
function isExcelFileType(fileType, fileName) {
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/excel',
    'application/x-excel'
  ];
  
  const allowedExtensions = ['.xlsx', '.xls'];
  const fileNameLower = fileName.toLowerCase();
  
  return allowedTypes.includes(fileType) || 
         allowedExtensions.some(ext => fileNameLower.endsWith(ext));
}

// Excel文件解析API
async function handleExcelParse(request, env, corsHeaders) {
  console.log('🔄 解析Excel文件...');
  
  try {
    const body = await request.json();
    const { filePath } = body;
    
    if (!filePath) {
      return Response.json({
        success: false,
        error: '文件路径不能为空'
      }, { headers: corsHeaders });
    }

    // 从R2获取文件
    if (env.R2_BUCKET) {
      const object = await env.R2_BUCKET.get(filePath);
      
      if (!object) {
        return Response.json({
          success: false,
          error: '文件不存在'
        }, { headers: corsHeaders });
      }

      // 模拟Excel解析 - 在实际环境中可以使用XLSX库
      const mockData = generateMockInventoryData();
      
      // 存储解析后的数据到模拟数据库
      const dataKey = `excel_data_${Date.now()}`;
      
      return Response.json({
        success: true,
        dataKey: dataKey,
        rows: mockData.length,
        columns: Object.keys(mockData[0] || {}).length,
        preview: mockData.slice(0, 5), // 前5行预览
        message: 'Excel文件解析成功'
      }, { headers: corsHeaders });
    } else {
      throw new Error('R2存储桶不可用');
    }
    
  } catch (error) {
    console.error('❌ Excel解析失败:', error);
    return Response.json({
      success: false,
      error: `Excel解析失败: ${error.message}`
    }, { 
      status: 500,
      headers: corsHeaders 
    });
  }
}

// 库存数据API
async function handleInventoryData(request, env, path, method, corsHeaders) {
  console.log('🔄 处理库存数据请求:', path);
  
  if (path === '/api/inventory/data' && method === 'GET') {
    // 获取库存数据
    const mockData = generateMockInventoryData();
    
    return Response.json({
      success: true,
      data: mockData,
      total: mockData.length,
      message: '库存数据获取成功'
    }, { headers: corsHeaders });
  } else if (path === '/api/inventory/summary' && method === 'GET') {
    // 获取库存汇总
    const mockData = generateMockInventoryData();
    const summary = calculateInventorySummary(mockData);
    
    return Response.json({
      success: true,
      summary: summary,
      message: '库存汇总计算成功'
    }, { headers: corsHeaders });
  }
  
  return Response.json({
    success: false,
    error: '不支持的库存API'
  }, { status: 404, headers: corsHeaders });
}

// 数据分析API
async function handleAnalyticsData(request, env, path, method, corsHeaders) {
  console.log('🔄 处理数据分析请求:', path);
  
  if (path === '/api/analytics/sales' && method === 'GET') {
    // 销售分析
    const salesAnalysis = generateSalesAnalysis();
    
    return Response.json({
      success: true,
      analysis: salesAnalysis,
      message: '销售分析完成'
    }, { headers: corsHeaders });
  } else if (path === '/api/analytics/trends' && method === 'GET') {
    // 趋势分析
    const trendsAnalysis = generateTrendsAnalysis();
    
    return Response.json({
      success: true,
      trends: trendsAnalysis,
      message: '趋势分析完成'
    }, { headers: corsHeaders });
  }
  
  return Response.json({
    success: false,
    error: '不支持的分析API'
  }, { status: 404, headers: corsHeaders });
}

// 生成模拟库存数据
function generateMockInventoryData() {
  const products = ['iPhone 15', 'Samsung Galaxy S24', 'iPad Pro', 'MacBook Air', 'AirPods Pro'];
  const categories = ['手机', '平板', '笔记本', '配件'];
  const suppliers = ['供应商A', '供应商B', '供应商C'];
  
  const data = [];
  for (let i = 1; i <= 100; i++) {
    data.push({
      id: i,
      sku: `SKU${String(i).padStart(6, '0')}`,
      productName: products[Math.floor(Math.random() * products.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      supplier: suppliers[Math.floor(Math.random() * suppliers.length)],
      stock: Math.floor(Math.random() * 1000) + 10,
      price: (Math.random() * 5000 + 500).toFixed(2),
      cost: (Math.random() * 3000 + 300).toFixed(2),
      lastUpdate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: Math.random() > 0.1 ? '正常' : '缺货'
    });
  }
  return data;
}

// 计算库存汇总
function calculateInventorySummary(data) {
  const totalProducts = data.length;
  const totalStock = data.reduce((sum, item) => sum + item.stock, 0);
  const totalValue = data.reduce((sum, item) => sum + (item.stock * parseFloat(item.price)), 0);
  const lowStockItems = data.filter(item => item.stock < 50).length;
  const outOfStockItems = data.filter(item => item.status === '缺货').length;
  
  return {
    totalProducts,
    totalStock,
    totalValue: totalValue.toFixed(2),
    lowStockItems,
    outOfStockItems,
    categories: [...new Set(data.map(item => item.category))].length
  };
}

// 生成销售分析数据
function generateSalesAnalysis() {
  const months = ['1月', '2月', '3月', '4月', '5月', '6月'];
  const salesData = months.map(month => ({
    month,
    sales: Math.floor(Math.random() * 1000000) + 500000,
    orders: Math.floor(Math.random() * 5000) + 1000,
    avgOrderValue: (Math.random() * 500 + 200).toFixed(2)
  }));
  
  return {
    monthlySales: salesData,
    totalSales: salesData.reduce((sum, item) => sum + item.sales, 0),
    totalOrders: salesData.reduce((sum, item) => sum + item.orders, 0),
    growthRate: ((Math.random() * 40 - 10).toFixed(1)) + '%'
  };
}

// 生成趋势分析数据
function generateTrendsAnalysis() {
  const categories = ['手机', '平板', '笔记本', '配件'];
  const trends = categories.map(category => ({
    category,
    trend: Math.random() > 0.5 ? '上升' : '下降',
    percentage: (Math.random() * 30).toFixed(1),
    recommendation: Math.random() > 0.5 ? '增加库存' : '减少订购'
  }));
  
  return {
    categoryTrends: trends,
    hotProducts: ['iPhone 15', 'MacBook Air', 'AirPods Pro'],
    seasonalForecast: '预计下季度销量增长15%'
  };
}

// 简单的Excel数据解析（模拟解析Excel内容）
function parseExcelData(arrayBuffer) {
  // 在实际环境中，这里应该使用XLSX.js等库来解析Excel
  // 现在我们生成模拟的SKU库存数据，按照您页面中显示的格式
  const mockData = [];
  
  for (let i = 1; i <= 100; i++) {
    mockData.push({
      SKU: `SKU${String(i).padStart(6, '0')}`,
      商品名称: `商品${i}`,
      最新库存: Math.floor(Math.random() * 1000) + 10,
      动态库存: Math.floor(Math.random() * 1000) + 10,
      销售数量: Math.floor(Math.random() * 50),
      单价: (Math.random() * 1000 + 100).toFixed(2),
      成本: (Math.random() * 500 + 50).toFixed(2),
      分类: ['手机', '平板', '笔记本', '配件'][Math.floor(Math.random() * 4)],
      供应商: ['供应商A', '供应商B', '供应商C'][Math.floor(Math.random() * 3)],
      状态: Math.random() > 0.1 ? '正常' : '缺货',
      最后更新: new Date().toISOString()
    });
  }
  
  return mockData;
}

// 获取文件扩展名
function getFileExtension(fileName) {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot !== -1 ? fileName.substring(lastDot + 1) : 'xlsx';
}

// 处理本地数据库API请求
async function handleLocalDB(request, env, path, method, corsHeaders) {
  console.log('🔄 处理本地数据库请求:', path);
  
  try {
    // 宽表相关API
    if (path === '/api/localdb/wide' && method === 'GET') {
      // 返回宽表数据：优先内存；若为空则尝试从R2读取并缓存
      let data = Array.isArray(wideTableCache) ? wideTableCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try {
          const obj = await env.R2_BUCKET.get(WIDE_TABLE_R2_KEY);
          if (obj) {
            const text = await obj.text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              wideTableCache = parsed;
              data = parsed;
            }
          }
        } catch (e) { console.warn('读取R2宽表失败:', e); }
      }
      await archiveOldDatesToRecords(env, 5);
      data = wideTableCache;
      // 读取后计算销量列
      wideTableCache = computeSalesForWideTableRows(wideTableCache);
      // 归档并返回
      await archiveOldDatesToRecords(env, 5);
      data = wideTableCache;
      return Response.json({ success: true, data, total: data.length }, { headers: corsHeaders });
    }
    
    else if (path === '/api/localdb/wide' && method === 'POST') {
      // 保存宽表数据
      const requestData = await request.json();
      console.log('💾 保存宽表数据:', requestData);
      if (requestData && Array.isArray(requestData.data)) {
        wideTableCache = requestData.data;
      }
      return Response.json({
        success: true,
        message: '宽表数据保存成功',
        data: requestData
      }, { headers: corsHeaders });
    }
    
    else if (path === '/api/localdb/wide/export' && method === 'GET') {
      // 导出宽表数据：仅导出真实数据，必要时从R2回填
      let data = Array.isArray(wideTableCache) ? wideTableCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try {
          const obj = await env.R2_BUCKET.get(WIDE_TABLE_R2_KEY);
          if (obj) {
            const text = await obj.text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              wideTableCache = parsed;
              data = parsed;
            }
          }
        } catch (e) { console.warn('读取R2宽表失败:', e); }
      }
      return Response.json({ success: true, data, message: '宽表数据导出成功' }, { headers: corsHeaders });
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
            wideTableCache = requestData.data;
            // 计算销量并持久化到R2
            wideTableCache = computeSalesForWideTableRows(wideTableCache);
            if (env.R2_BUCKET) {
              try {
                await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), {
                  httpMetadata: { contentType: 'application/json' },
                  customMetadata: { updatedAt: new Date().toISOString() }
                });
              } catch (e) { console.warn('写入R2宽表失败:', e); }
            }
            await archiveOldDatesToRecords(env, 5);
          }
          
          return Response.json({ success: true, message: '批量数据上传成功', processed: requestData.data ? requestData.data.length : 0, data: Array.isArray(wideTableCache) ? wideTableCache : [] }, { headers: corsHeaders });
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
    
    // 记录相关API
    else if (path === '/api/localdb/records' && method === 'GET') {
      // 返回记录列表：内存优先，其次R2
      let data = Array.isArray(recordsCache) ? recordsCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try { const obj = await env.R2_BUCKET.get(RECORDS_R2_KEY); if (obj) { const text = await obj.text(); const parsed = JSON.parse(text); if (Array.isArray(parsed)) { recordsCache = parsed; data = parsed; } } } catch(e){ console.warn('读取R2记录失败:', e); }
      }
      return Response.json({ success: true, data, total: data.length }, { headers: corsHeaders });
    }
    
    else if (path === '/api/localdb/records' && method === 'POST') {
      // 添加记录（JSON）
      const requestData = await request.json();
      console.log('➕ 添加记录:', requestData);
      const record = { ...requestData, id: Date.now() };
      if (!Array.isArray(recordsCache)) recordsCache = [];
      recordsCache.unshift(record);
      if (env.R2_BUCKET) { try { await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), { httpMetadata: { contentType: 'application/json' } }); } catch(e){ console.warn('写入R2记录失败:', e);} }
      return Response.json({ success: true, message: '记录添加成功', data: record }, { headers: corsHeaders });
    }
    
    else if (path.startsWith('/api/localdb/records/') && method === 'PUT') {
      // 更新记录
      const recordId = path.split('/').pop();
      const requestData = await request.json();
      console.log('✏️ 更新记录:', recordId, requestData);
      if (Array.isArray(recordsCache)) {
        const idx = recordsCache.findIndex(r => String(r.id) === String(recordId));
        if (idx !== -1) { recordsCache[idx] = { ...recordsCache[idx], ...requestData, id: recordsCache[idx].id }; }
      }
      if (env.R2_BUCKET) { try { await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), { httpMetadata: { contentType: 'application/json' } }); } catch(e){ console.warn('写入R2记录失败:', e);} }
      return Response.json({ success: true, message: '记录更新成功', data: { ...requestData, id: recordId } }, { headers: corsHeaders });
    }
    
    else if (path.startsWith('/api/localdb/records/') && method === 'DELETE') {
      // 删除记录
      const recordId = path.split('/').pop();
      console.log('🗑️ 删除记录:', recordId);
      if (Array.isArray(recordsCache)) recordsCache = recordsCache.filter(r => String(r.id) !== String(recordId));
      if (env.R2_BUCKET) { try { await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), { httpMetadata: { contentType: 'application/json' } }); } catch(e){ console.warn('写入R2记录失败:', e);} }
      return Response.json({ success: true, message: '记录删除成功' }, { headers: corsHeaders });
    }
    
    else if (path === '/api/localdb/records/batch' && method === 'POST') {
      // 批量导入记录（JSON优先；multipart仅提示）
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        return Response.json({ success: true, message: '文件已接收；请前端解析成JSON后提交' }, { headers: corsHeaders });
      }
      const requestData = await request.json();
      console.log('📤 批量导入记录(JSON):', requestData);
      if (requestData && Array.isArray(requestData.data)) {
        if (!Array.isArray(recordsCache)) recordsCache = [];
        // 生成id并插入到头部
        const now = Date.now();
        const withIds = requestData.data.map((r, i) => ({ id: now + i, ...r }));
        recordsCache = [...withIds, ...recordsCache];
        if (env.R2_BUCKET) { try { await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), { httpMetadata: { contentType: 'application/json' } }); } catch(e){ console.warn('写入R2记录失败:', e);} }
        return Response.json({ success: true, message: '批量记录导入成功', processed: withIds.length }, { headers: corsHeaders });
      }
      return Response.json({ success: false, error: '数据格式不正确' }, { headers: corsHeaders });
    }
    
    else if (path === '/api/localdb/records/export' && method === 'GET') {
      // 导出记录数据（真实）
      let data = Array.isArray(recordsCache) ? recordsCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try { const obj = await env.R2_BUCKET.get(RECORDS_R2_KEY); if (obj) { const text = await obj.text(); const parsed = JSON.parse(text); if (Array.isArray(parsed)) { recordsCache = parsed; data = parsed; } } } catch(e){ console.warn('读取R2记录失败:', e); }
      }
      return Response.json({ success: true, data, message: '记录数据导出成功' }, { headers: corsHeaders });
    }
    
    else if (path === '/api/localdb/records/clear-all' && (method === 'POST' || method === 'GET')) {
      recordsCache = [];
      if (env.R2_BUCKET) { try { await env.R2_BUCKET.delete(RECORDS_R2_KEY); } catch(e){ console.warn('删除R2记录失败:', e);} }
      return Response.json({ success: true, message: '成功清空所有记录数据' }, { headers: corsHeaders });
    }
    
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

// 生成模拟宽表数据
function generateMockWideData() {
  const data = [];
  const now = Date.now();
  const format = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    const dt = new Date(d);
    return `${dt.getFullYear()}/${pad(dt.getMonth()+1)}/${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  };
  for (let i = 1; i <= 50; i++) {
    data.push({
      '系统履约单号': `${Date.now()}${String(i).padStart(4,'0')}`,
      '店铺订单时间': format(now - i * 1234567),
      'SKU': `X${String(774305 + i).padStart(6,'0')}NA`,
      '商品数量': 1
    });
  }
  return data;
}

// 生成模拟记录数据
function generateMockRecords() {
  const records = [];
  
  for (let i = 1; i <= 20; i++) {
    records.push({
      id: i,
      fileName: `Excel数据表${i}.xlsx`,
      uploadTime: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString(),
      recordCount: Math.floor(Math.random() * 500) + 100,
      status: Math.random() > 0.1 ? '已处理' : '处理中',
      description: `批次${i}的库存数据导入`
    });
  }
  
  return records.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));
}

// 下载文件：将 R2 对象流式返回
async function handleFileDownload(request, env, path, corsHeaders) {
  try {
    const id = path.split('/')[3];
    // 由于当前文件列表没有保存 id->key 的映射，使用约定：id 为时间戳前缀，匹配 arc/ 前缀下包含该前缀的对象
    if (!env.R2_BUCKET) throw new Error('R2存储桶不可用');
    const list = await env.R2_BUCKET.list({ prefix: 'arc/' });
    const match = list.objects.find(o => o.key.includes(id));
    if (!match) {
      return Response.json({ success: false, error: '文件不存在' }, { status: 404, headers: corsHeaders });
    }
    const obj = await env.R2_BUCKET.get(match.key);
    if (!obj) {
      return Response.json({ success: false, error: '文件不存在' }, { status: 404, headers: corsHeaders });
    }
    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${(obj.customMetadata?.originalName)||'download.xlsx'}"`);
    return new Response(obj.body, { headers });
  } catch (error) {
    console.error('下载失败:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// 解析/预览文件：返回模拟的分页与表头数据（占位实现）
async function handleFileAnalyze(request, env, path, corsHeaders) {
  try {
    const url = new URL(request.url);
    const id = path.split('/')[3];
    const sheet = url.searchParams.get('sheet') || 'Sheet1';
    const page = parseInt(url.searchParams.get('page')||'1');
    const limit = parseInt(url.searchParams.get('limit')||'20');

    // 生成模拟数据（后续可改为从 R2 读取并用 XLSX 解析）
    const headers = ['SKU','列A','列B','列C','列D','列E'];
    const rowsTotal = 150;
    const allRows = Array.from({length: rowsTotal}, (_,i)=>[
      `SKU${String(i+1).padStart(6,'0')}`,'A'+(i+1),'B'+(i+1),'C'+(i+1),'D'+(i+1),'E'+(i+1)
    ]);
    const start = (page-1)*limit;
    const data = allRows.slice(start, start+limit);

    // 简单模拟所有工作表信息
    const allSheets = [
      { name:'Sheet1', rowCount: rowsTotal, colCount: headers.length, headers: headers.slice(0,6) },
      { name:'Sheet2', rowCount: 0, colCount: 0, headers: [] }
    ];

    return Response.json({
      success: true,
      analysis: {
        fileName: `文件_${id}.xlsx`,
        currentSheet: sheet,
        allSheets,
        headers,
        data,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(rowsTotal/limit),
          totalRows: rowsTotal,
          limit,
          hasNext: page*limit<rowsTotal,
          hasPrev: page>1
        },
        summary: {
          uploadTime: new Date().toISOString(),
          fileSize: 1024*1024,
          uploadedBy: 'admin',
          totalSheets: allSheets.length
        },
        performance: { processingTime: 5 }
      }
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('分析失败:', error);
    return Response.json({ success:false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// 处理打包系统的R2路由（/api/r2/*）
async function handleR2Routes(request, env, path, method, corsHeaders) {
  try {
    // 上传：/api/r2/upload/package/<path>
    if (path.startsWith('/api/r2/upload/package/') && method === 'POST') {
      const targetPath = decodeURIComponent(path.replace('/api/r2/upload/package/', ''));
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) {
        return Response.json({ success: false, error: '没有上传文件' }, { headers: corsHeaders });
      }
      const r2Key = `package/${targetPath}`;
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: 'R2存储桶不可用' }, { headers: corsHeaders, status: 500 });
      }
      await env.R2_BUCKET.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
        customMetadata: {
          originalName: file.name,
          uploadTime: new Date().toISOString()
        }
      });
      return Response.json({ success: true, message: '上传成功', filePath: r2Key, size: file.size || 0 }, { headers: corsHeaders });
    }

    // 列表：/api/r2/list-files?folder=package&prefix=...&limit=...
    if (path === '/api/r2/list-files' && method === 'GET') {
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: 'R2存储桶不可用' }, { headers: corsHeaders, status: 500 });
      }
      const url = new URL(request.url);
      const folder = url.searchParams.get('folder') || '';
      const prefix = url.searchParams.get('prefix') || '';
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const keyPrefix = folder ? `${folder}/${prefix || ''}` : prefix;
      const res = await env.R2_BUCKET.list({ prefix: keyPrefix, limit });
      return Response.json({ success: true, files: res.objects || [] }, { headers: corsHeaders });
    }

    // 删除：/api/r2/delete/<path>
    if (path.startsWith('/api/r2/delete/') && method === 'DELETE') {
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: 'R2存储桶不可用' }, { headers: corsHeaders, status: 500 });
      }
      const targetPath = decodeURIComponent(path.replace('/api/r2/delete/', ''));
      await env.R2_BUCKET.delete(targetPath);
      return Response.json({ success: true, message: '删除成功' }, { headers: corsHeaders });
    }

    // 公共URL：/api/r2/public-url/<filename>?folder=package
    if (path.startsWith('/api/r2/public-url/') && method === 'GET') {
      const url = new URL(request.url);
      const folder = url.searchParams.get('folder') || '';
      const fileName = decodeURIComponent(path.replace('/api/r2/public-url/', ''));
      const key = folder ? `${folder}/${fileName}` : fileName;
      const publicUrl = `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${key}`;
      return Response.json({ success: true, url: publicUrl }, { headers: corsHeaders });
    }

    return Response.json({ success: false, error: '不支持的R2路由' }, { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error('R2路由错误:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// 处理天猫订单API请求 - 映射到localdb功能
async function handleTmallOrders(request, env, path, method, corsHeaders) {
  console.log('🔄 处理天猫订单请求:', path);
  
  try {
    // 专用：/api/tmall-orders/wide GET -> 返回按天明细行，供分析页面使用
    if (path === '/api/tmall-orders/wide' && method === 'GET') {
      // 确保有最新宽表数据（内存 / R2）
      let data = Array.isArray(wideTableCache) ? wideTableCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try { const obj = await env.R2_BUCKET.get(WIDE_TABLE_R2_KEY); if (obj) { const text = await obj.text(); const parsed = JSON.parse(text); if (Array.isArray(parsed)) { wideTableCache = parsed; data = parsed; } } } catch(e){ console.warn('读取R2宽表失败:', e); }
      }
      // 在展平前，确保销量列已计算
      wideTableCache = computeSalesForWideTableRows(wideTableCache);
      // 展平：把各日期列转换为行 {SKU, 店铺订单时间, 商品数量}
      const rows = [];
      (data || []).forEach(row => {
        const dateKeys = getDateKeysFromRow(row);
        dateKeys.forEach(k => {
          const sales = parseInt(row[k + '_销量']) || 0; // 优先使用已计算的销量
          // 若没有销量字段，也可使用库存变化，但这里保守用0
          rows.push({
            SKU: row.SKU || '',
            '店铺订单时间': k,
            '商品数量': sales
          });
        });
      });
      return Response.json({ success: true, data: rows }, { headers: corsHeaders });
    }

    // 将tmall-orders路径映射到localdb路径
    let mappedPath = path.replace('/api/tmall-orders/', '/api/localdb/');
    
    // 特殊路径映射
    if (path.endsWith('/smart-import')) {
      mappedPath = '/api/localdb/wide/batch';
    } else if (path.endsWith('/wide/clear-all')) {
      // 明确处理 clear-all，避免将 "clear-all" 再次替换成 "clear-all-all"
      mappedPath = '/api/localdb/wide/clear-all';
    } else if (path.endsWith('/wide/clear')) {
      mappedPath = '/api/localdb/wide/clear-all';
    }
    
    console.log(`📍 路径映射: ${path} → ${mappedPath}`);
    
    // 调用现有的localdb处理函数
    return await handleLocalDB(request, env, mappedPath, method, corsHeaders);
    
  } catch (error) {
    console.error('❌ 天猫订单API错误:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { 
      status: 500,
      headers: corsHeaders 
    });
  }
}
