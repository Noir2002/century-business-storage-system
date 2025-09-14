// 简化的Cloudflare Workers - 专注于Excel文件上传到R2
// 轻量级内存缓存：用于在同一 Worker 实例中暂存“宽表”数据，便于上传后即时刷新
let wideTableCache = [];
let recordsCache = [];
let tmallWideCache = [];
const WIDE_TABLE_R2_KEY = 'wide/latest.json';
const RECORDS_R2_KEY = 'records/latest.json';
const TMALL_WIDE_R2_KEY = 'tmall/wide.json';

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
  // 关闭自动归档：若未显式配置 ARCHIVE_KEEP_DAYS，则不做归档
  const configured = env && env.ARCHIVE_KEEP_DAYS !== undefined && env.ARCHIVE_KEEP_DAYS !== null;
  const effectiveKeepDays = configured ? parseInt(env.ARCHIVE_KEEP_DAYS) || 0 : 0;
  if (effectiveKeepDays <= 0) return;
  keepDays = effectiveKeepDays;
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
        } else if (path === '/api/package/upload' && method === 'POST') {
          return await handlePackageUpload(request, env, corsHeaders);
        } else if (path === '/api/files' && method === 'GET') {
          return await handleFilesList(request, env, corsHeaders);
        } else if (path === '/api/package/files' && method === 'GET') {
          return await handlePackageFilesList(request, env, corsHeaders);
        } else if (path === '/api/files/presigned-url' && method === 'POST') {
          return await handlePresignedUrl(request, env, corsHeaders);
        } else if (path === '/api/files/parse' && method === 'POST') {
          return await handleExcelParse(request, env, corsHeaders);
        } else if (path.startsWith('/api/files/') && method === 'GET' && path.endsWith('/download')) {
          return await handleFileDownload(request, env, path, corsHeaders);
        } else if (path.startsWith('/api/package/') && method === 'GET' && path.endsWith('/download')) {
          return await handlePackageFileDownload(request, env, path, corsHeaders);
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
        } else if (path.startsWith('/api/package-sync/')) {
          return await handlePackageSync(request, env, path, method, corsHeaders);
        } else if (path.startsWith('/api/listing/') || path.startsWith('/api/delisting/')) {
          return await handleListingManagement(request, env, path, method, corsHeaders);
        } else if (path.startsWith('/api/reorganize/')) {
          return await handleReorganization(request, env, path, method, corsHeaders);
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

// 处理打包系统文件上传（支持所有文件类型）
async function handlePackageUpload(request, env, corsHeaders) {
  console.log('🔄 处理打包系统文件上传...');
  
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

    // 生成文件名
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1E9);
    const fileExtension = getFileExtension(file.name);
    const fileName = `${timestamp}-${randomSuffix}.${fileExtension}`;
    const filePath = `package/${fileName}`;
    
    console.log(`📁 上传文件路径: ${filePath}`);

    // 上传到R2
    if (env.R2_BUCKET) {
      console.log('📦 使用R2 Bucket上传...');
      await env.R2_BUCKET.put(filePath, file.stream(), {
        httpMetadata: {
          contentType: file.type || 'application/octet-stream',
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
      uploadedBy: 'package-system',
      description: description,
      r2Path: filePath,
      publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${filePath}`
    };

    console.log('✅ 打包系统文件上传成功:', fileName);
    
    return Response.json({
      success: true,
      message: '文件上传成功',
      file: fileInfo
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 打包系统文件上传失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

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

// 获取打包文件列表
async function handlePackageFilesList(request, env, corsHeaders) {
  console.log('🔄 获取打包文件列表...');

  try {
    if (!env.R2_BUCKET) {
      throw new Error('R2存储桶不可用');
    }

    // 列出 package/ 前缀下的所有文件
    const list = await env.R2_BUCKET.list({ prefix: 'package/' });
    
    const files = [];
    for (const obj of list.objects) {
      try {
        // 获取文件元数据
        const fileObj = await env.R2_BUCKET.get(obj.key);
        if (fileObj) {
          files.push({
            id: extractIdFromFileName(obj.key),
            originalName: fileObj.customMetadata?.originalName || obj.key.split('/').pop(),
            fileName: obj.key.split('/').pop(),
            size: obj.size,
            uploadTime: fileObj.customMetadata?.uploadTime || obj.uploaded.toISOString(),
            description: fileObj.customMetadata?.description || '',
            r2Path: obj.key,
            publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${obj.key}`
          });
        }
      } catch (err) {
        console.warn('获取文件元数据失败:', obj.key, err.message);
      }
    }

    console.log(`✅ 找到 ${files.length} 个打包文件`);
    
    return Response.json({
      success: true,
      files: files
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 获取打包文件列表失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
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
    // 获取库存数据 - 使用真实数据
    const salesData = await generateRealSalesData(env);
    
    return Response.json({
      success: true,
      data: salesData,
      total: salesData.length,
      message: '库存数据获取成功'
    }, { headers: corsHeaders });
  } else if (path === '/api/inventory/summary' && method === 'GET') {
    // 获取库存汇总 - 使用真实数据
    const summary = await generateRealInventorySummary(env);
    
    return Response.json({
      success: true,
      data: summary,
      message: '库存汇总获取成功'
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
    // 销售分析 - 使用真实数据
    const salesAnalysis = await generateRealSalesAnalysis(env);
    
    return Response.json({
      success: true,
      data: salesAnalysis,
      message: '销售分析完成'
    }, { headers: corsHeaders });
  } else if (path === '/api/analytics/trends' && method === 'GET') {
    // 趋势分析 - 使用真实数据
    const trendsAnalysis = await generateRealTrendsAnalysis(env);
    
    return Response.json({
      success: true,
      data: trendsAnalysis,
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
        
        // 执行自动归档：将超过5天的数据移动到历史记录
        await archiveOldDatesToRecords(env, 5);
        
        // 如果历史记录为空且是新导入的数据，生成一些测试历史记录
        if ((!Array.isArray(recordsCache) || recordsCache.length === 0) && wideTableCache.length > 0) {
          recordsCache = generateTestHistoricalRecords(wideTableCache.slice(0, 5)); // 为前5个SKU生成历史数据
          console.log('🔄 为新导入数据生成了', recordsCache.length, '条测试历史记录');
        }
        
        // 持久化到R2
        if (env.R2_BUCKET) {
          try {
            await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), {
              httpMetadata: { contentType: 'application/json' },
              customMetadata: { updatedAt: new Date().toISOString() }
            });
            
            // 同时保存历史记录到R2
            if (Array.isArray(recordsCache) && recordsCache.length > 0) {
              await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), {
                httpMetadata: { contentType: 'application/json' },
                customMetadata: { updatedAt: new Date().toISOString() }
              });
            }
            
            console.log('✅ 数据已持久化到R2，宽表:', wideTableCache.length, '行，历史记录:', recordsCache.length, '条');
          } catch (e) { 
            console.warn('写入R2失败:', e); 
          }
        }
      }
      return Response.json({
        success: true,
        message: '宽表数据保存成功',
        wideTableCount: wideTableCache.length,
        recordsCount: recordsCache.length
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
            // 不自动归档，保持列结构不变
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
    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
    const statuses = ['已处理', '处理中', '失败'];

    for (let i = 1; i <= 20; i++) {
        records.push({
            id: i,
            fileName: `Excel数据表${i}.xlsx`,
            uploadTime: new Date(Date.now() - Math.random() * TEN_DAYS_MS).toISOString(),
            recordCount: Math.floor(Math.random() * 500) + 100,
            status: statuses[Math.floor(Math.random() * statuses.length)],
            description: `批次${i}的库存数据导入`
        });
    }

    return records.sort((a, b) => Date.parse(b.uploadTime) - Date.parse(a.uploadTime));
}

// 从文件名中提取ID
function extractIdFromFileName(filePath) {
  const fileName = filePath.split('/').pop();
  const match = fileName.match(/^(\d+)-/);
  return match ? match[1] : fileName;
}

// 下载打包文件
async function handlePackageFileDownload(request, env, path, corsHeaders) {
  try {
    const id = path.split('/')[3];
    if (!env.R2_BUCKET) throw new Error('R2存储桶不可用');
    
    // 在 package/ 前缀下查找包含该ID的文件
    const list = await env.R2_BUCKET.list({ prefix: 'package/' });
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
    headers.set('Content-Disposition', `attachment; filename="${(obj.customMetadata?.originalName)||'download'}"`);
    return new Response(obj.body, { headers });
  } catch (error) {
    console.error('下载打包文件失败:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
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
      const description = formData.get('description') || '';
      
      if (!file) {
        return Response.json({ success: false, error: '没有上传文件' }, { headers: corsHeaders });
      }
      
      // 直接使用targetPath作为R2键，因为前端已经构建了完整的路径
      const r2Key = targetPath;
      
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: 'R2存储桶不可用' }, { headers: corsHeaders, status: 500 });
      }
      
      console.log(`📁 上传文件到R2: ${r2Key}`);
      
      await env.R2_BUCKET.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
        customMetadata: {
          originalName: file.name,
          uploadTime: new Date().toISOString(),
          description: description
        }
      });
      
      // 构建文件信息返回给前端
      const fileInfo = {
        id: Date.now(),
        fileName: file.name,
        originalName: file.name,
        size: file.size,
        uploadTime: new Date().toISOString(),
        r2Path: r2Key,
        publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${r2Key}`
      };
      
      return Response.json({ 
        success: true, 
        message: '上传成功', 
        file: fileInfo,
        filePath: r2Key, 
        size: file.size || 0 
      }, { headers: corsHeaders });
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
    // 恢复：将 tmall-orders 路径简单映射到 localdb（与之前可正常显示分析图表的行为一致）
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

// 处理打包系统数据同步（/api/package-sync/*）
async function handlePackageSync(request, env, path, method, corsHeaders) {
  try {
    // 上传数据库：/api/package-sync/database
    if (path === '/api/package-sync/database' && method === 'POST') {
      const data = await request.json();
      const key = 'package-sync/database.json';
      
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: 'R2存储桶不可用' }, { headers: corsHeaders, status: 500 });
      }
      
      // 保存到R2
      await env.R2_BUCKET.put(key, JSON.stringify({
        ...data,
        lastSync: new Date().toISOString()
      }), {
        httpMetadata: { contentType: 'application/json' }
      });
      
      return Response.json({ success: true, message: '数据库同步成功' }, { headers: corsHeaders });
    }
    
    // 下载数据库：/api/package-sync/database
    if (path === '/api/package-sync/database' && method === 'GET') {
      const key = 'package-sync/database.json';
      
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: 'R2存储桶不可用' }, { headers: corsHeaders, status: 500 });
      }
      
      const object = await env.R2_BUCKET.get(key);
      if (!object) {
        return Response.json({ success: false, data: null, message: '暂无同步数据' }, { headers: corsHeaders });
      }
      
      const data = await object.json();
      return Response.json({ success: true, data }, { headers: corsHeaders });
    }
    
    // 上传文件注册表：/api/package-sync/files
    if (path === '/api/package-sync/files' && method === 'POST') {
      const data = await request.json();
      const key = 'package-sync/files.json';
      
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: 'R2存储桶不可用' }, { headers: corsHeaders, status: 500 });
      }
      
      // 保存到R2
      await env.R2_BUCKET.put(key, JSON.stringify({
        ...data,
        lastSync: new Date().toISOString()
      }), {
        httpMetadata: { contentType: 'application/json' }
      });
      
      return Response.json({ success: true, message: '文件注册表同步成功' }, { headers: corsHeaders });
    }
    
    // 下载文件注册表：/api/package-sync/files
    if (path === '/api/package-sync/files' && method === 'GET') {
      const key = 'package-sync/files.json';
      
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: 'R2存储桶不可用' }, { headers: corsHeaders, status: 500 });
      }
      
      const object = await env.R2_BUCKET.get(key);
      if (!object) {
        return Response.json({ success: false, data: null, message: '暂无同步数据' }, { headers: corsHeaders });
      }
      
      const data = await object.json();
      return Response.json({ success: true, data }, { headers: corsHeaders });
    }
    
    return Response.json({ success: false, error: '不支持的同步操作' }, { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error('数据同步失败:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// ==================== 真实数据分析函数 ====================

// 从R2读取真实数据并进行分析
async function getRealDataFromR2(env) {
  let wideData = [];
  let recordsData = [];
  
  // 尝试从R2读取宽表数据
  if (env.R2_BUCKET) {
    try {
      const wideObj = await env.R2_BUCKET.get(WIDE_TABLE_R2_KEY);
      if (wideObj) {
        const wideText = await wideObj.text();
        wideData = JSON.parse(wideText) || [];
      }
    } catch (e) {
      console.warn('读取R2宽表数据失败:', e);
    }
    
    try {
      const recordsObj = await env.R2_BUCKET.get(RECORDS_R2_KEY);
      if (recordsObj) {
        const recordsText = await recordsObj.text();
        recordsData = JSON.parse(recordsText) || [];
      }
    } catch (e) {
      console.warn('读取R2历史记录失败:', e);
    }
  }
  
  // 如果R2没有数据，使用内存缓存
  if (wideData.length === 0 && Array.isArray(wideTableCache)) {
    wideData = wideTableCache;
  }
  if (recordsData.length === 0 && Array.isArray(recordsCache)) {
    recordsData = recordsCache;
  }
  
  return { wideData, recordsData };
}

// 生成真实销售分析数据
async function generateRealSalesAnalysis(env) {
  const { wideData, recordsData } = await getRealDataFromR2(env);
  
  // 计算统计数据
  const totalSku = new Set([...wideData.map(r => r.SKU), ...recordsData.map(r => r.SKU)]).size;
  
  // 计算库存健康率 (有库存的SKU比例)
  const healthySku = wideData.filter(row => {
    const dates = Object.keys(row).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
    return dates.some(date => (parseInt(row[date]) || 0) > 0);
  }).length;
  const healthRate = totalSku > 0 ? Math.round((healthySku / totalSku) * 100) : 0;
  
  // 计算总销量
  let totalSales = 0;
  wideData.forEach(row => {
    Object.keys(row).forEach(key => {
      if (key.includes('_销量')) {
        totalSales += parseInt(row[key]) || 0;
      }
    });
  });
  recordsData.forEach(record => {
    totalSales += parseInt(record['销量']) || 0;
  });
  
  // 平均周转率 (简化计算)
  const avgTurnover = totalSku > 0 ? Math.round(totalSales / totalSku * 10) / 10 : 0;
  
  // 库存预警 (库存为0的SKU)
  const warningCount = wideData.filter(row => {
    const dates = Object.keys(row).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
    return dates.every(date => (parseInt(row[date]) || 0) === 0);
  }).length;
  
  return {
    totalSku: totalSku,
    healthRate: healthRate,
    avgTurnover: avgTurnover,
    warningCount: warningCount,
    totalRecords: recordsData.length,
    totalSales: totalSales
  };
}

// 生成真实趋势分析数据
async function generateRealTrendsAnalysis(env) {
  const { wideData, recordsData } = await getRealDataFromR2(env);
  
  // 收集所有日期
  const allDates = new Set();
  wideData.forEach(row => {
    Object.keys(row).forEach(key => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        allDates.add(key);
      }
    });
  });
  recordsData.forEach(record => {
    if (record['日期']) {
      const dateMatch = record['日期'].match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        allDates.add(dateMatch[1]);
      }
    }
  });
  
  const sortedDates = Array.from(allDates).sort();
  
  // 计算每日库存和销量趋势
  const trends = sortedDates.map(date => {
    let totalStock = 0;
    let totalSales = 0;
    
    // 从宽表数据计算
    wideData.forEach(row => {
      if (row[date] !== undefined) {
        totalStock += parseInt(row[date]) || 0;
      }
      if (row[date + '_销量'] !== undefined) {
        totalSales += parseInt(row[date + '_销量']) || 0;
      }
    });
    
    // 从记录数据计算
    recordsData.forEach(record => {
      if (record['日期'] && record['日期'].includes(date)) {
        totalStock += parseInt(record['库存']) || 0;
        totalSales += parseInt(record['销量']) || 0;
      }
    });
    
    return {
      date: date,
      stock: totalStock,
      sales: totalSales
    };
  });
  
  return trends;
}

// 生成真实销售数据
async function generateRealSalesData(env) {
  const { wideData, recordsData } = await getRealDataFromR2(env);
  
  // 合并数据为销售趋势格式
  const salesData = [];
  
  // 处理宽表数据
  wideData.forEach(row => {
    Object.keys(row).forEach(key => {
      if (key.includes('_销量')) {
        const date = key.replace('_销量', '');
        const sales = parseInt(row[key]) || 0;
        if (sales > 0) {
          salesData.push({
            date: date,
            sku: row.SKU,
            sales: sales,
            productName: row['产品中文名']
          });
        }
      }
    });
  });
  
  // 处理记录数据
  recordsData.forEach(record => {
    const sales = parseInt(record['销量']) || 0;
    if (sales > 0 && record['日期']) {
      const dateMatch = record['日期'].match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        salesData.push({
          date: dateMatch[1],
          sku: record.SKU,
          sales: sales,
          productName: record['产品中文名']
        });
      }
    }
  });
  
  return salesData;
}

// 生成真实库存汇总
async function generateRealInventorySummary(env) {
  const { wideData, recordsData } = await getRealDataFromR2(env);
  
  // 按SKU汇总数据
  const skuSummary = {};
  
  // 处理宽表数据
  wideData.forEach(row => {
    if (!row.SKU) return;
    
    if (!skuSummary[row.SKU]) {
      skuSummary[row.SKU] = {
        sku: row.SKU,
        productName: row['产品中文名'] || '',
        url: row['网页链接'] || '',
        initialStock: parseInt(row['初始库存']) || 0,
        currentStock: 0,
        totalSales: 0,
        lastUpdate: ''
      };
    }
    
    // 找最新库存
    const dates = Object.keys(row).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    if (dates.length > 0) {
      const latestDate = dates[dates.length - 1];
      skuSummary[row.SKU].currentStock = parseInt(row[latestDate]) || 0;
      skuSummary[row.SKU].lastUpdate = latestDate;
    }
    
    // 累计销量
    Object.keys(row).forEach(key => {
      if (key.includes('_销量')) {
        skuSummary[row.SKU].totalSales += parseInt(row[key]) || 0;
      }
    });
  });
  
  // 处理记录数据
  recordsData.forEach(record => {
    if (!record.SKU) return;
    
    if (!skuSummary[record.SKU]) {
      skuSummary[record.SKU] = {
        sku: record.SKU,
        productName: record['产品中文名'] || '',
        url: record['网页链接'] || '',
        initialStock: parseInt(record['初始库存']) || 0,
        currentStock: parseInt(record['库存']) || 0,
        totalSales: parseInt(record['销量']) || 0,
        lastUpdate: record['日期'] || ''
      };
    } else {
      // 更新最新记录
      if (record['日期'] > skuSummary[record.SKU].lastUpdate) {
        skuSummary[record.SKU].currentStock = parseInt(record['库存']) || 0;
        skuSummary[record.SKU].lastUpdate = record['日期'] || '';
      }
      skuSummary[record.SKU].totalSales += parseInt(record['销量']) || 0;
    }
  });
  
  return Object.values(skuSummary);
}

// 生成测试历史记录（为新导入的数据创建一些历史数据）
function generateTestHistoricalRecords(sampleRows) {
  const testRecords = [];
  const today = new Date();
  
  // 为每个SKU生成过去30天的历史数据
  sampleRows.forEach(row => {
    if (!row.SKU) return;
    
    for (let dayOffset = 30; dayOffset > 5; dayOffset--) {
      const date = new Date(today);
      date.setDate(today.getDate() - dayOffset);
      const dateStr = date.toISOString().split('T')[0] + ' 12:00';
      
      const stock = Math.floor(Math.random() * 80) + 20; // 20-100库存
      const sales = Math.floor(Math.random() * 5); // 0-4销量
      
      testRecords.push({
        id: Date.now() + Math.floor(Math.random() * 1000000),
        SKU: row.SKU,
        '产品中文名': row['产品中文名'] || '测试产品',
        '网页链接': row['网页链接'] || '',
        '初始库存': row['初始库存'] || 100,
        '日期': dateStr,
        '库存': stock,
        '销量': sales,
        createTime: new Date().toISOString(),
        createBy: 'auto-generated'
      });
    }
  });
  
  return testRecords;
}

// 处理上下架管理API
async function handleListingManagement(request, env, path, method, corsHeaders) {
  console.log('🔄 处理上下架管理请求:', path);
  
  try {
    if (path === '/api/listing/candidates' && method === 'GET') {
      // 获取待上架商品候选
      const { wideData } = await getRealDataFromR2(env);
      
      const candidates = wideData.filter(row => {
        // 计算当前库存
        const dates = Object.keys(row).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        const latestDate = dates[dates.length - 1];
        const currentStock = latestDate ? (parseInt(row[latestDate]) || 0) : 0;
        
        // 库存>10且状态为下架或未设置状态
        return currentStock > 10 && (!row.status || row.status === 'offline');
      }).map(row => {
        const dates = Object.keys(row).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        const latestDate = dates[dates.length - 1];
        const currentStock = latestDate ? (parseInt(row[latestDate]) || 0) : 0;
        
        return {
          sku: row.SKU,
          productName: row['产品中文名'],
          currentStock: currentStock,
          status: row.status || 'offline'
        };
      });
      
      return Response.json({
        success: true,
        data: candidates,
        message: '获取待上架商品成功'
      }, { headers: corsHeaders });
      
    } else if (path === '/api/delisting/candidates' && method === 'GET') {
      // 获取待下架商品候选
      const { wideData } = await getRealDataFromR2(env);
      
      const candidates = wideData.filter(row => {
        // 计算当前库存
        const dates = Object.keys(row).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        const latestDate = dates[dates.length - 1];
        const currentStock = latestDate ? (parseInt(row[latestDate]) || 0) : 0;
        
        // 库存为0且状态为上架
        return currentStock === 0 && row.status === 'online';
      }).map(row => {
        return {
          sku: row.SKU,
          productName: row['产品中文名'],
          currentStock: 0,
          status: row.status
        };
      });
      
      return Response.json({
        success: true,
        data: candidates,
        message: '获取待下架商品成功'
      }, { headers: corsHeaders });
      
    } else if (path === '/api/listing/confirm' && method === 'POST') {
      // 确认上架
      const { skus } = await request.json();
      if (!Array.isArray(skus)) {
        return Response.json({ 
          success: false, 
          error: 'SKU列表格式错误' 
        }, { status: 400, headers: corsHeaders });
      }
      
      let updatedCount = 0;
      wideTableCache.forEach(row => {
        if (skus.includes(row.SKU)) {
          row.status = 'online';
          updatedCount++;
        }
      });
      
      // 持久化到R2
      if (env.R2_BUCKET && wideTableCache.length > 0) {
        try {
          await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), {
            httpMetadata: { contentType: 'application/json' }
          });
        } catch (e) {
          console.warn('保存上架状态到R2失败:', e);
        }
      }
      
      return Response.json({
        success: true,
        message: `成功上架 ${updatedCount} 个商品`,
        updatedCount: updatedCount
      }, { headers: corsHeaders });
      
    } else if (path === '/api/delisting/confirm' && method === 'POST') {
      // 确认下架
      const { skus } = await request.json();
      if (!Array.isArray(skus)) {
        return Response.json({ 
          success: false, 
          error: 'SKU列表格式错误' 
        }, { status: 400, headers: corsHeaders });
      }
      
      let updatedCount = 0;
      wideTableCache.forEach(row => {
        if (skus.includes(row.SKU)) {
          row.status = 'offline';
          updatedCount++;
        }
      });
      
      // 持久化到R2
      if (env.R2_BUCKET && wideTableCache.length > 0) {
        try {
          await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), {
            httpMetadata: { contentType: 'application/json' }
          });
        } catch (e) {
          console.warn('保存下架状态到R2失败:', e);
        }
      }
      
      return Response.json({
        success: true,
        message: `成功下架 ${updatedCount} 个商品`,
        updatedCount: updatedCount
      }, { headers: corsHeaders });
    }
    
    return Response.json({
      success: false,
      error: '不支持的上下架管理操作'
    }, { status: 404, headers: corsHeaders });
    
  } catch (error) {
    console.error('上下架管理失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

// 处理文件重新组织API请求
async function handleReorganization(request, env, path, method, corsHeaders) {
  console.log('🔄 处理文件重新组织请求:', path);
  
  try {
    if (path === '/api/reorganize/start' && method === 'POST') {
      return await startReorganization(env, corsHeaders);
    } else if (path === '/api/reorganize/status' && method === 'GET') {
      return await getReorganizationStatus(env, corsHeaders);
    } else if (path === '/api/reorganize/files' && method === 'GET') {
      return await getFilesToReorganize(env, corsHeaders);
    } else if (path.startsWith('/api/reorganize/move/') && method === 'POST') {
      const fileKey = decodeURIComponent(path.replace('/api/reorganize/move/', ''));
      return await moveFile(fileKey, env, corsHeaders);
    } else if (path === '/api/reorganize/analyze' && method === 'GET') {
      return await analyzeFiles(env, corsHeaders);
    } else if (path === '/api/reorganize/reset' && method === 'POST') {
      return await resetReorganization(env, corsHeaders);
    } else if (path === '/api/reorganize/debug' && method === 'GET') {
      return await debugReorganization(env, corsHeaders);
    } else if (path === '/api/reorganize/test' && method === 'GET') {
      return await testReorganization(env, corsHeaders);
    }
    
    return Response.json({
      success: false,
      error: '不支持的重新组织操作'
    }, { status: 404, headers: corsHeaders });
    
  } catch (error) {
    console.error('文件重新组织失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

// 开始重新组织过程
async function startReorganization(env, corsHeaders) {
  console.log('🚀 开始文件重新组织...');
  
  try {
    if (!env.R2_BUCKET) {
      throw new Error('R2存储桶不可用');
    }

    // 获取数据库数据
    let databaseData = null;
    try {
      const dbObj = await env.R2_BUCKET.get('package-sync/database.json');
      if (dbObj) {
        const dbContent = await dbObj.json();
        if (dbContent && dbContent.data) {
          databaseData = new Map();
          for (const record of dbContent.data) {
            if (record.lp && record.contract) {
              // 存储LP号后四位到履约单号的映射
              const lpSuffix = record.lp.slice(-4); // 取LP号后四位
              databaseData.set(lpSuffix, record.contract);
            }
          }
          console.log(`📊 加载数据库数据: ${databaseData.size} 条记录`);
        }
      }
    } catch (error) {
      console.warn('⚠️ 无法加载数据库数据，将使用LP号后四位作为履约单号:', error.message);
    }

    // 获取所有文件
    const allObjects = await env.R2_BUCKET.list({ limit: 1000 });
    const filesToMove = [];
    
    // 识别需要移动的文件（使用与analyzeFiles相同的逻辑）
    for (const obj of allObjects.objects) {
      const key = obj.key;
      
      // 跳过库存系统文件和重组相关文件
      if (key.startsWith('arc/') || 
          key.startsWith('package-sync/') ||
          key.startsWith('wide/') ||
          key.startsWith('records/') ||
          key.startsWith('tmall/') ||
          key.startsWith('reorganization/')) {
        continue;
      }
      
      // 识别需要重新组织的文件
      let needsReorganization = false;
      let reason = '';
      
      // 1. 根目录的图片和视频文件
      if (key.match(/\.(jpg|jpeg|png|gif|mp4|avi|mov)$/i) && !key.includes('/')) {
        needsReorganization = true;
        reason = '根目录图片/视频文件';
        console.log(`📁 根目录文件需要重新组织: ${key}`);
      }
      // 2. 日期格式文件夹中的文件
      else if (key.match(/^\d{8}_[^/]+\//)) {
        needsReorganization = true;
        reason = '日期格式文件夹中的文件';
        console.log(`📁 日期文件夹文件需要重新组织: ${key}`);
      }
      // 3. package/文件夹中嵌套在时间戳文件夹中的文件
      else if (key.startsWith('package/') && key.match(/^package\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}_\d+\/\d+\//)) {
        needsReorganization = true;
        reason = 'package文件夹中嵌套在时间戳文件夹中的文件';
        console.log(`📁 嵌套时间戳文件夹文件需要重新组织: ${key}`);
      }
      // 4. package/文件夹中但路径不正确的文件（其他情况）
      else if (key.startsWith('package/') && !key.match(/^package\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}_\d+\/[^/]+$/)) {
        needsReorganization = true;
        reason = 'package文件夹中路径不正确的文件';
        console.log(`📁 package文件夹中路径不正确的文件需要重新组织: ${key}`);
      }
      
      if (needsReorganization) {
        filesToMove.push({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          contentType: obj.httpMetadata?.contentType || 'application/octet-stream'
        });
      }
    }

    console.log(`📋 找到 ${filesToMove.length} 个需要重新组织的文件`);

    // 生成移动计划
    const movePlan = filesToMove.map(file => {
      const folderPath = generateNewPath(file.key, file.uploaded, databaseData);
      const fileName = file.key.split('/').pop();
      const newFilePath = `${folderPath}/${fileName}`;
      
      console.log(`📋 移动计划: ${file.key} -> ${newFilePath}`);
      
      return {
        source: file.key,
        destination: newFilePath,
        size: file.size,
        contentType: file.contentType
      };
    });

    // 存储移动计划到R2
    await env.R2_BUCKET.put('reorganization/plan.json', JSON.stringify({
      plan: movePlan,
      totalFiles: movePlan.length,
      createdAt: new Date().toISOString(),
      status: 'in_progress'
    }), {
      httpMetadata: { contentType: 'application/json' }
    });

    // 开始实际移动文件
    let movedCount = 0;
    let errorCount = 0;
    const errors = [];

    console.log(`🔄 开始移动 ${movePlan.length} 个文件...`);

    for (const item of movePlan) {
      try {
        console.log(`🔍 检查文件: ${item.source}`);
        
        // 检查目标文件是否已存在（如果存在，说明已经移动过了）
        const destObj = await env.R2_BUCKET.get(item.destination);
        if (destObj) {
          console.log(`✅ 文件已存在: ${item.destination}，跳过移动`);
          movedCount++;
          continue;
        }

        // 检查源文件是否存在
        const sourceObj = await env.R2_BUCKET.get(item.source);
        if (!sourceObj) {
          console.warn(`⚠️ 源文件不存在: ${item.source}`);
          console.warn(`🔍 尝试查找相似文件...`);
          
          // 尝试列出所有文件来调试
          const allFiles = await env.R2_BUCKET.list({ prefix: 'package/' });
          const similarFiles = allFiles.objects.filter(obj => 
            obj.key.includes(item.source.split('/').pop()) || 
            item.source.split('/').pop().includes(obj.key.split('/').pop())
          );
          
          console.warn(`🔍 找到相似文件:`, similarFiles.map(f => f.key));
          
          errorCount++;
          errors.push(`源文件不存在: ${item.source}`);
          continue;
        }

        // 移动文件（复制到新位置，然后删除原文件）
        await env.R2_BUCKET.put(item.destination, sourceObj.body, {
          httpMetadata: sourceObj.httpMetadata,
          customMetadata: {
            ...sourceObj.customMetadata,
            originalPath: item.source,
            movedAt: new Date().toISOString()
          }
        });

        // 确认新文件创建成功后，删除原文件
        const verifyObj = await env.R2_BUCKET.get(item.destination);
        if (verifyObj) {
          await env.R2_BUCKET.delete(item.source);
          movedCount++;
          console.log(`✅ 文件移动成功: ${item.source} -> ${item.destination}`);
        } else {
          throw new Error('新文件创建失败，取消移动操作');
        }

      } catch (error) {
        console.error(`❌ 移动文件失败 ${item.source}:`, error);
        errorCount++;
        errors.push(`移动失败 ${item.source}: ${error.message}`);
      }
    }

    // 更新计划状态
    await env.R2_BUCKET.put('reorganization/plan.json', JSON.stringify({
      plan: movePlan,
      totalFiles: movePlan.length,
      movedFiles: movedCount,
      errorCount: errorCount,
      errors: errors,
      createdAt: new Date().toISOString(),
      status: 'completed'
    }), {
      httpMetadata: { contentType: 'application/json' }
    });

    console.log(`🎉 文件重新组织完成: ${movedCount}/${movePlan.length} 个文件成功移动`);

    return Response.json({
      success: true,
      message: `文件重新组织完成: ${movedCount}/${movePlan.length} 个文件成功移动`,
      totalFiles: movePlan.length,
      movedFiles: movedCount,
      errorCount: errorCount,
      errors: errors.slice(0, 5) // 只返回前5个错误
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 开始重新组织失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

// 获取重新组织状态
async function getReorganizationStatus(env, corsHeaders) {
  try {
    if (!env.R2_BUCKET) {
      throw new Error('R2存储桶不可用');
    }

    const planObj = await env.R2_BUCKET.get('reorganization/plan.json');
    if (!planObj) {
      return Response.json({
        success: true,
        status: 'no_plan',
        message: '没有找到重新组织计划'
      }, { headers: corsHeaders });
    }

    const plan = await planObj.json();
    
    // 检查实际移动进度
    let movedCount = 0;
    let errorCount = 0;
    for (const item of plan.plan) {
      const destObj = await env.R2_BUCKET.get(item.destination);
      const sourceObj = await env.R2_BUCKET.get(item.source);
      
      if (destObj) {
        // 目标文件存在，说明移动成功
        movedCount++;
      } else if (sourceObj) {
        // 源文件存在但目标文件不存在，说明移动失败
        errorCount++;
      }
      // 如果源文件和目标文件都不存在，可能是已经被其他操作处理了
    }

    return Response.json({
      success: true,
      status: plan.status,
      totalFiles: plan.totalFiles,
      movedFiles: movedCount,
      errorCount: errorCount,
      progress: plan.totalFiles > 0 ? Math.round((movedCount / plan.totalFiles) * 100) : 0,
      createdAt: plan.createdAt
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 获取状态失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

// 获取需要重新组织的文件列表
async function getFilesToReorganize(env, corsHeaders) {
  try {
    if (!env.R2_BUCKET) {
      throw new Error('R2存储桶不可用');
    }

    const planObj = await env.R2_BUCKET.get('reorganization/plan.json');
    if (!planObj) {
      return Response.json({
        success: false,
        message: '没有找到重新组织计划，请先调用 /api/reorganize/start'
      }, { headers: corsHeaders });
    }

    const plan = await planObj.json();
    
    return Response.json({
      success: true,
      files: plan.plan,
      total: plan.totalFiles
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 获取文件列表失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

// 分析文件类型
async function analyzeFiles(env, corsHeaders) {
  try {
    if (!env.R2_BUCKET) {
      throw new Error('R2存储桶不可用');
    }

    // 获取所有文件
    const allObjects = await env.R2_BUCKET.list({ limit: 1000 });
    
    // 分类文件
    const categories = {
      inventorySystem: [], // 库存系统文件
      packageSystem: [],   // 打包系统文件
      other: []            // 其他文件
    };
    
    for (const obj of allObjects.objects) {
      const key = obj.key;
      
      // 跳过重组相关的临时文件
      if (key === 'reorganization/plan.json' || key.startsWith('reorganization/temp/')) {
        continue;
      }
      
      // 库存系统文件
      if (key.startsWith('arc/') || 
          key.startsWith('package-sync/') ||
          key.startsWith('wide/') ||
          key.startsWith('records/') ||
          key.startsWith('tmall/')) {
        categories.inventorySystem.push({
          key: key,
          size: obj.size,
          uploaded: obj.uploaded,
          contentType: obj.httpMetadata?.contentType || 'application/octet-stream'
        });
      }
      // 打包系统文件（需要重新组织）
      else if (key.startsWith('package/') ||
               key.match(/^\d{8}_[^/]+\//) ||
               (key.match(/\.(jpg|jpeg|png|gif|mp4|avi|mov)$/i) && !key.includes('/'))) {
        categories.packageSystem.push({
          key: key,
          size: obj.size,
          uploaded: obj.uploaded,
          contentType: obj.httpMetadata?.contentType || 'application/octet-stream'
        });
      }
      // 其他文件
      else {
        categories.other.push({
          key: key,
          size: obj.size,
          uploaded: obj.uploaded,
          contentType: obj.httpMetadata?.contentType || 'application/octet-stream'
        });
      }
    }
    
    return Response.json({
      success: true,
      categories: categories,
      summary: {
        inventorySystem: categories.inventorySystem.length,
        packageSystem: categories.packageSystem.length,
        other: categories.other.length,
        total: categories.inventorySystem.length + categories.packageSystem.length + categories.other.length
      }
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 分析文件失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

// 移动单个文件
async function moveFile(fileKey, env, corsHeaders) {
  try {
    if (!env.R2_BUCKET) {
      throw new Error('R2存储桶不可用');
    }

    // 获取原文件
    const sourceObj = await env.R2_BUCKET.get(fileKey);
    if (!sourceObj) {
      return Response.json({
        success: false,
        error: '源文件不存在'
      }, { status: 404, headers: corsHeaders });
    }

    // 生成新路径（文件夹路径）
    const folderPath = generateNewPath(fileKey, sourceObj.uploaded);
    
    // 从原文件路径中提取文件名
    const fileName = fileKey.split('/').pop();
    const newFilePath = `${folderPath}/${fileName}`;
    
    // 检查目标文件是否已存在
    const destObj = await env.R2_BUCKET.get(newFilePath);
    if (destObj) {
      return Response.json({
        success: false,
        error: '目标文件已存在'
      }, { status: 409, headers: corsHeaders });
    }

    // 移动文件到新位置（先复制，再删除）
    await env.R2_BUCKET.put(newFilePath, sourceObj.body, {
      httpMetadata: sourceObj.httpMetadata,
      customMetadata: {
        ...sourceObj.customMetadata,
        originalPath: fileKey,
        movedAt: new Date().toISOString()
      }
    });

    // 确认新文件创建成功后，删除原文件
    const verifyObj = await env.R2_BUCKET.get(newFilePath);
    if (verifyObj) {
      await env.R2_BUCKET.delete(fileKey);
      console.log(`✅ 文件移动成功: ${fileKey} -> ${newFilePath}`);
    } else {
      throw new Error('新文件创建失败，取消移动操作');
    }

    return Response.json({
      success: true,
      message: '文件移动成功',
      source: fileKey,
      destination: newFilePath
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 移动文件失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

// 生成新的文件路径
function generateNewPath(fileKey, uploadTime, databaseData = null) {
  console.log(`🔍 生成路径: ${fileKey}`);
  
  // 处理嵌套在时间戳文件夹中的文件
  // 格式：package/2025-09/2025-09-01/2025-09-01_0441/1756735814490/20250901_...
  const nestedMatch = fileKey.match(/^package\/(\d{4}-\d{2})\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})_(\d+)\/\d+\/(.+)$/);
  if (nestedMatch) {
    const yearMonth = nestedMatch[1];
    const yearMonthDay = nestedMatch[2];
    const contractSuffix = nestedMatch[4];
    const fileName = nestedMatch[5];
    
    // 查找对应的履约单号
    let contractNumber = contractSuffix; // 默认使用后缀
    
    if (databaseData && databaseData.has(contractSuffix)) {
      contractNumber = databaseData.get(contractSuffix);
      console.log(`🔍 找到匹配: 后缀 ${contractSuffix} -> 履约单号 ${contractNumber}`);
    } else {
      console.log(`⚠️ 未找到匹配: 后缀 ${contractSuffix}，使用后缀作为文件夹名`);
    }
    
    return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${contractNumber}`;
  }
  
  // 处理根目录的图片和视频文件
  if (fileKey.match(/\.(jpg|jpeg|png|gif|mp4|avi|mov)$/i) && !fileKey.includes('/')) {
    const fileName = fileKey;
    
    // 尝试从文件名提取日期和LP号后四位（格式：20250901_0441）
    const dateLpMatch = fileName.match(/^(\d{8})_(\d{4})/);
    if (dateLpMatch) {
      const dateStr = dateLpMatch[1];
      const lpSuffix = dateLpMatch[2];
      
      // 将YYYYMMDD转换为YYYY-MM-DD格式
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      const yearMonth = `${year}-${month}`;
      const yearMonthDay = `${year}-${month}-${day}`;
      
      // 查找对应的履约单号
      let contractNumber = lpSuffix;
      
      if (databaseData && databaseData.has(lpSuffix)) {
        contractNumber = databaseData.get(lpSuffix);
        console.log(`🔍 找到匹配: LP号后四位 ${lpSuffix} -> 履约单号 ${contractNumber}`);
      } else {
        console.log(`⚠️ 未找到匹配: LP号后四位 ${lpSuffix}，使用LP号后四位作为文件夹名`);
      }
      
      return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${contractNumber}`;
    }
    
    // 尝试从时间戳文件名提取信息（格式：1757513851798-887008722.jpg）
    const timestampMatch = fileName.match(/^(\d{13,})-(\d+)\./);
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1]);
      const fileId = timestampMatch[2];
      
      // 使用时间戳推断日期
      const uploadDate = new Date(timestamp);
      const year = uploadDate.getFullYear();
      const month = String(uploadDate.getMonth() + 1).padStart(2, '0');
      const day = String(uploadDate.getDate()).padStart(2, '0');
      const yearMonth = `${year}-${month}`;
      const yearMonthDay = `${year}-${month}-${day}`;
      
      // 尝试从文件ID中提取LP号后四位
      const lpSuffix = fileId.slice(-4);
      let contractNumber = lpSuffix;
      
      if (databaseData && databaseData.has(lpSuffix)) {
        contractNumber = databaseData.get(lpSuffix);
        console.log(`🔍 找到匹配: 文件ID后四位 ${lpSuffix} -> 履约单号 ${contractNumber}`);
      } else {
        console.log(`⚠️ 未找到匹配: 文件ID后四位 ${lpSuffix}，使用文件ID后四位作为文件夹名`);
      }
      
      return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${contractNumber}`;
    }
    
    // 使用上传时间推断日期
    const uploadDate = new Date(uploadTime);
    const year = uploadDate.getFullYear();
    const month = String(uploadDate.getMonth() + 1).padStart(2, '0');
    const day = String(uploadDate.getDate()).padStart(2, '0');
    const yearMonth = `${year}-${month}`;
    const yearMonthDay = `${year}-${month}-${day}`;
    
    // 从文件名中提取可能的数字作为默认履约单号
    const numberMatch = fileName.match(/(\d{4,})/);
    const defaultContract = numberMatch ? numberMatch[1].slice(-4) : 'UNKNOWN';
    
    console.log(`📅 使用上传时间推断日期: ${yearMonthDay}, 默认履约单号: ${defaultContract}`);
    
    return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${defaultContract}`;
  }
  
  // 处理日期格式文件夹中的文件
  const dateFolderMatch = fileKey.match(/^(\d{8})_([^/]+)\/(.+)$/);
  if (dateFolderMatch) {
    const dateStr = dateFolderMatch[1];
    const folderSuffix = dateFolderMatch[2];
    const fileName = dateFolderMatch[3];
    
    // 将YYYYMMDD转换为YYYY-MM-DD格式
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const yearMonth = `${year}-${month}`;
    const yearMonthDay = `${year}-${month}-${day}`;
    
    // 查找对应的履约单号
    let contractNumber = folderSuffix;
    
    if (databaseData && databaseData.has(folderSuffix)) {
      contractNumber = databaseData.get(folderSuffix);
      console.log(`🔍 找到匹配: 文件夹后缀 ${folderSuffix} -> 履约单号 ${contractNumber}`);
    } else {
      console.log(`⚠️ 未找到匹配: 文件夹后缀 ${folderSuffix}，使用文件夹后缀作为文件夹名`);
    }
    
    return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${contractNumber}`;
  }
  
  // 默认情况：使用上传时间推断日期
  const uploadDate = new Date(uploadTime);
  const year = uploadDate.getFullYear();
  const month = String(uploadDate.getMonth() + 1).padStart(2, '0');
  const day = String(uploadDate.getDate()).padStart(2, '0');
  const yearMonth = `${year}-${month}`;
  const yearMonthDay = `${year}-${month}-${day}`;
  
  const fileName = fileKey.split('/').pop();
  const numberMatch = fileName.match(/(\d{4,})/);
  const defaultContract = numberMatch ? numberMatch[1].slice(-4) : 'UNKNOWN';
  
  console.log(`📅 默认情况: 使用上传时间推断日期: ${yearMonthDay}, 默认履约单号: ${defaultContract}`);
  
  return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${defaultContract}`;
}

// 重置重新组织状态
async function resetReorganization(env, corsHeaders) {
  try {
    console.log('🔄 重置重新组织状态...');
    
    if (!env.R2_BUCKET) {
      throw new Error('R2存储桶不可用');
    }

    // 删除现有的计划文件
    await env.R2_BUCKET.delete('reorganization/plan.json');
    
    console.log('✅ 重新组织状态已重置');
    
    return Response.json({
      success: true,
      message: '重新组织状态已重置，可以重新开始'
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 重置失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

// 调试重新组织状态
async function debugReorganization(env, corsHeaders) {
  try {
    console.log('🔍 调试重新组织状态...');
    
    if (!env.R2_BUCKET) {
      throw new Error('R2存储桶不可用');
    }

    const debugInfo = {
      timestamp: new Date().toISOString(),
      planExists: false,
      planData: null,
      actualFiles: [],
      movedFiles: [],
      errors: []
    };

    // 检查计划文件
    try {
      const planObj = await env.R2_BUCKET.get('reorganization/plan.json');
      if (planObj) {
        debugInfo.planExists = true;
        debugInfo.planData = await planObj.json();
      }
    } catch (error) {
      debugInfo.errors.push(`计划文件读取错误: ${error.message}`);
    }

    // 检查实际文件状态
    try {
      const allObjects = await env.R2_BUCKET.list({ limit: 1000 });
      debugInfo.actualFiles = allObjects.objects.map(obj => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        contentType: obj.httpMetadata?.contentType
      }));
    } catch (error) {
      debugInfo.errors.push(`文件列表读取错误: ${error.message}`);
    }

    // 如果有计划，检查移动状态
    if (debugInfo.planData && debugInfo.planData.plan) {
      for (const item of debugInfo.planData.plan) {
        try {
          const destObj = await env.R2_BUCKET.get(item.destination);
          const sourceObj = await env.R2_BUCKET.get(item.source);
          
          debugInfo.movedFiles.push({
            source: item.source,
            destination: item.destination,
            sourceExists: !!sourceObj,
            destinationExists: !!destObj,
            status: destObj ? 'moved' : (sourceObj ? 'not_moved' : 'missing')
          });
        } catch (error) {
          debugInfo.errors.push(`检查文件 ${item.source} 错误: ${error.message}`);
        }
      }
    }

    return Response.json({
      success: true,
      debug: debugInfo
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 调试失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

// 测试重新组织逻辑
async function testReorganization(env, corsHeaders) {
  try {
    console.log('🧪 测试重新组织逻辑...');
    
    if (!env.R2_BUCKET) {
      throw new Error('R2存储桶不可用');
    }

    // 获取所有文件
    const allObjects = await env.R2_BUCKET.list({ limit: 1000 });
    const testResults = {
      totalFiles: allObjects.objects.length,
      filesToMove: [],
      skippedFiles: [],
      errors: []
    };

    for (const obj of allObjects.objects) {
      const key = obj.key;
      
      // 跳过库存系统文件和重组相关文件
      if (key.startsWith('arc/') || 
          key.startsWith('package-sync/') ||
          key.startsWith('wide/') ||
          key.startsWith('records/') ||
          key.startsWith('tmall/') ||
          key.startsWith('reorganization/')) {
        testResults.skippedFiles.push({
          key: key,
          reason: '库存系统或重组相关文件'
        });
        continue;
      }
      
      // 识别需要重新组织的文件（与startReorganization使用相同逻辑）
      let needsReorganization = false;
      let reason = '';
      
      // 1. 根目录的图片和视频文件
      if (key.match(/\.(jpg|jpeg|png|gif|mp4|avi|mov)$/i) && !key.includes('/')) {
        needsReorganization = true;
        reason = '根目录图片/视频文件';
      }
      // 2. 日期格式文件夹中的文件
      else if (key.match(/^\d{8}_[^/]+\//)) {
        needsReorganization = true;
        reason = '日期格式文件夹中的文件';
      }
      // 3. package/文件夹中嵌套在时间戳文件夹中的文件
      else if (key.startsWith('package/') && key.match(/^package\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}_\d+\/\d+\//)) {
        needsReorganization = true;
        reason = 'package文件夹中嵌套在时间戳文件夹中的文件';
      }
      // 4. package/文件夹中但路径不正确的文件（其他情况）
      else if (key.startsWith('package/') && !key.match(/^package\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}_\d+\/[^/]+$/)) {
        needsReorganization = true;
        reason = 'package文件夹中路径不正确的文件';
      }
      
      if (needsReorganization) {
        // 测试路径生成
        try {
          const folderPath = generateNewPath(key, obj.uploaded);
          const fileName = key.split('/').pop();
          const newFilePath = `${folderPath}/${fileName}`;
          
          testResults.filesToMove.push({
            key: key,
            newPath: newFilePath,
            reason: reason,
            size: obj.size,
            contentType: obj.httpMetadata?.contentType || 'application/octet-stream'
          });
        } catch (error) {
          testResults.errors.push({
            key: key,
            error: error.message
          });
        }
      } else {
        // 检查为什么被跳过
        let skipReason = '不需要重新组织';
        if (key.startsWith('package/') && key.match(/^package\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}_\d+\//)) {
          skipReason = '已在正确路径中';
        } else if (!key.match(/\.(jpg|jpeg|png|gif|mp4|avi|mov)$/i)) {
          skipReason = '不是图片/视频文件';
        }
        
        testResults.skippedFiles.push({
          key: key,
          reason: skipReason
        });
      }
    }

    return Response.json({
      success: true,
      test: testResults
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ 测试失败:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
