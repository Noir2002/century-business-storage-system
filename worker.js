// Cloudflare Workers版本的后端API
// 这将替代server.js在云端运行

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS处理
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 路由处理
      if (path === '/api/health') {
        return handleHealth();
      } else if (path === '/api/auth/login' && method === 'POST') {
        return handleLogin(request);
      } else if (path.startsWith('/api/localdb/')) {
        return handleLocalDB(request, env, path, method);
      } else if (path.startsWith('/api/analysis/')) {
        return handleAnalysis(request, env, path);
      } else if (path.startsWith('/api/files/')) {
        return handleFiles(request, env, path, method);
      } else if (path.startsWith('/api/r2/')) {
        return handleR2Proxy(request, env, path, method);
      } else {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('Worker Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// 健康检查
function handleHealth() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Century Business System Workers运行正常'
  });
}

// 用户登录
async function handleLogin(request) {
  const body = await request.json();
  const { username, password, role } = body;

  // 模拟用户数据（实际应该从KV存储读取）
  const users = [
    {
      id: 1,
      username: 'admin',
      password: '123456', // 实际应该是加密的
      role: 'admin',
      realname: '系统管理员',
      email: 'admin@example.com'
    },
    {
      id: 2,
      username: 'analyst',
      password: '123456',
      role: 'analyst',
      realname: '数据分析员',
      email: 'analyst@example.com'
    }
  ];

  const user = users.find(u => 
    u.username === username && 
    u.password === password && 
    u.role === role
  );

  if (!user) {
    return Response.json(
      { error: '用户名、密码或角色不正确' },
      { status: 401 }
    );
  }

  // 生成简单的token（实际应该使用JWT）
  const token = btoa(JSON.stringify({ id: user.id, username, role }));

  return Response.json({
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
}

// 本地数据库API（简化版，使用内存存储）
async function handleLocalDB(request, env, path, method) {
  // 暂时使用模拟数据，不依赖KV
  const mockWideTableData = [
    {
      SKU: 'SKU001',
      '产品中文名': '测试产品1',
      '网页链接': 'https://example.com/product1',
      '初始库存': 100,
      '2025-01-01': 95,
      '2025-01-01_销量': 5,
      '2025-01-02': 90,
      '2025-01-02_销量': 5
    },
    {
      SKU: 'SKU002',
      '产品中文名': '测试产品2',
      '网页链接': 'https://example.com/product2',
      '初始库存': 50,
      '2025-01-01': 48,
      '2025-01-01_销量': 2,
      '2025-01-02': 45,
      '2025-01-02_销量': 3
    }
  ];
  
  if (path === '/api/localdb/wide' && method === 'GET') {
    return Response.json({ success: true, data: mockWideTableData });
  } else if (path === '/api/localdb/wide' && method === 'POST') {
    // 模拟保存成功
    return Response.json({ success: true, message: '宽表数据保存成功（模拟）' });
  } else if (path === '/api/localdb/records' && method === 'GET') {
    // 模拟记录数据
    const mockRecords = [
      {
        id: 1,
        SKU: 'SKU001',
        '产品中文名': '测试产品1',
        '网页链接': 'https://example.com/product1',
        '日期': '2025-01-01',
        '库存': 95,
        '销量': 5
      }
    ];
    return Response.json({ success: true, data: mockRecords });
  }
  
  return Response.json({ error: '不支持的API路径' }, { status: 404 });
}

// 数据分析API
async function handleAnalysis(request, env, path) {
  // 不再依赖KV，使用模拟数据
  
  if (path === '/api/analysis/overview') {
    // 模拟分析概览数据
    
    const overview = {
      totalSku: 50,
      healthRate: Math.round(Math.random() * 100),
      avgTurnover: Math.round(Math.random() * 10 * 10) / 10,
      warningCount: Math.round(Math.random() * 20),
      totalRecords: Math.round(Math.random() * 1000)
    };
    
    return Response.json({ success: true, data: overview });
  } else if (path === '/api/analysis/sku-details') {
    // 模拟SKU详细数据
    const mockSkuData = Array.from({ length: 20 }, (_, i) => ({
      sku: `SKU${String(i + 1).padStart(6, '0')}`,
      currentStock: Math.round(Math.random() * 100),
      totalSales: Math.round(Math.random() * 500),
      turnover: Math.round(Math.random() * 10 * 10) / 10,
      status: ['healthy', 'warning', 'outOfStock'][Math.floor(Math.random() * 3)],
      trend: ['up', 'down', 'stable'][Math.floor(Math.random() * 3)],
      suggestion: ['维持现状', '考虑补货', '促销清库'][Math.floor(Math.random() * 3)]
    }));
    
    return Response.json({ success: true, data: mockSkuData });
  }
  
  return Response.json({ error: '不支持的分析API' }, { status: 404 });
}

// 文件管理API
async function handleFiles(request, env, path, method) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (path === '/api/files' && method === 'GET') {
    // 从R2获取arc/文件夹下的文件列表
    try {
      const r2ApiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID || '23441d4f7734b84186c4c20ddefef8e7'}/r2/buckets/century-business-system/objects?list-type=2&prefix=arc/`;
      
      const response = await fetch(r2ApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN || 'ucKoqfP3F3w38eAlDj-12hqCBAEG10S5SpcijzC3'}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        const files = (data.result?.objects || []).map((obj, index) => ({
          id: index + 1,
          originalName: obj.key.replace('arc/', ''),
          size: obj.size || 0,
          uploadTime: obj.uploaded || new Date().toISOString(),
          uploadedBy: 'admin',
          sheetNames: ['Sheet1'],
          rowCount: 100,
          colCount: 8,
          r2Path: obj.key
        }));
        
        return Response.json({ success: true, files }, { headers: corsHeaders });
      }
    } catch (error) {
      console.error('获取文件列表失败:', error);
    }
    
    // 回退到模拟数据
    const mockFiles = [
      {
        id: 1,
        originalName: 'sample-data.xlsx',
        size: 245760,
        uploadTime: new Date().toISOString(),
        uploadedBy: 'admin',
        sheetNames: ['Sheet1'],
        rowCount: 100,
        colCount: 8
      }
    ];
    
    return Response.json({ success: true, files: mockFiles }, { headers: corsHeaders });
  } else if (path === '/api/files/upload' && method === 'POST') {
    // 仓库管理系统的Excel文件上传
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
      const fileExtension = file.name.split('.').pop();
      const fileName = `${timestamp}-${randomSuffix}.${fileExtension}`;
      const filePath = `arc/${fileName}`;
      
      // 上传到R2
      await env.R2_BUCKET.put(filePath, file.stream(), {
        httpMetadata: {
          contentType: file.type,
        },
      });
      
      // 模拟Excel文件信息解析
      const fileInfo = {
        id: timestamp,
        originalName: file.name,
        filename: fileName,
        size: file.size,
        uploadTime: new Date().toISOString(),
        uploadedBy: 'admin', // 从request获取用户信息
        sheetNames: ['Sheet1'], // 简化处理
        rowCount: 100,
        colCount: 10,
        description: description,
        r2Path: filePath
      };
      
      return Response.json({
        success: true,
        message: '文件上传成功',
        file: fileInfo
      }, { headers: corsHeaders });
      
    } catch (error) {
      console.error('文件上传错误:', error);
      return Response.json({
        success: false,
        error: '文件处理失败: ' + error.message
      }, { 
        status: 500,
        headers: corsHeaders 
      });
    }
  }
  
  return Response.json({ error: '文件API暂未完全实现' }, { status: 501, headers: corsHeaders });
}

// R2代理API - 通过Workers代理R2操作以避免CORS问题
async function handleR2Proxy(request, env, path, method) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    // 从环境变量获取配置
    const apiToken = env.CLOUDFLARE_API_TOKEN || 'ucKoqfP3F3w38eAlDj-12hqCBAEG10S5SpcijzC3';
    const accountId = env.CLOUDFLARE_ACCOUNT_ID || '23441d4f7734b84186c4c20ddefef8e7';
    const bucketName = 'century-business-system';

    if (path === '/api/r2/test-connection') {
      // 测试R2连接
      const r2ApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`;
      
      const response = await fetch(r2ApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        const buckets = data.result || [];
        const targetBucket = buckets.find(b => b.name === bucketName);
        
        if (targetBucket) {
          return Response.json({
            success: true,
            bucket: targetBucket,
            totalBuckets: buckets.length
          }, { headers: corsHeaders });
        } else {
          return Response.json({
            success: false,
            error: `未找到存储桶: ${bucketName}`,
            availableBuckets: buckets.map(b => b.name)
          }, { headers: corsHeaders });
        }
      } else {
        return Response.json({
          success: false,
          error: data.errors?.[0]?.message || '未知错误'
        }, { headers: corsHeaders });
      }
    } else if (path === '/api/r2/list-files') {
      // 列出文件
      const url = new URL(request.url);
      const prefix = url.searchParams.get('prefix') || '';
      const folder = url.searchParams.get('folder') || '';
      const limit = url.searchParams.get('limit') || '100';
      
      // 构建文件路径前缀：支持 package/ 和 arc/ 文件夹
      let fullPrefix = '';
      if (folder === 'package') {
        fullPrefix = prefix ? `package/${prefix}` : 'package/';
      } else if (folder === 'arc') {
        fullPrefix = prefix ? `arc/${prefix}` : 'arc/';
      } else if (prefix) {
        fullPrefix = prefix;
      }
      
      const params = new URLSearchParams({
        'list-type': '2',
        'max-keys': limit
      });
      
      if (fullPrefix) {
        params.append('prefix', fullPrefix);
      }
      
      const r2ApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects?${params}`;
      
      const response = await fetch(r2ApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        return Response.json({
          success: true,
          files: data.result?.objects || [],
          truncated: data.result?.truncated || false
        }, { headers: corsHeaders });
      } else {
        return Response.json({
          success: false,
          error: data.errors?.[0]?.message || '未知错误'
        }, { headers: corsHeaders });
      }
    } else if (path.startsWith('/api/r2/delete/') && method === 'DELETE') {
      // 删除文件
      const fileName = decodeURIComponent(path.replace('/api/r2/delete/', ''));
      
      const r2ApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects/${encodeURIComponent(fileName)}`;
      
      const response = await fetch(r2ApiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return Response.json({
          success: true,
          message: '文件删除成功'
        }, { headers: corsHeaders });
      } else {
        const data = await response.json();
        return Response.json({
          success: false,
          error: data.errors?.[0]?.message || '删除失败'
        }, { headers: corsHeaders });
      }
    } else if (path.startsWith('/api/r2/public-url/')) {
      // 获取公共URL
      const fileName = decodeURIComponent(path.replace('/api/r2/public-url/', ''));
      const folder = new URL(request.url).searchParams.get('folder') || '';
      
      const filePath = folder ? `${folder}/${fileName}` : fileName;
      const publicUrl = `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${filePath}`;
      
      return Response.json({
        success: true,
        url: publicUrl
      }, { headers: corsHeaders });
    } else if (path.startsWith('/api/r2/upload/')) {
      // 文件上传
      if (method !== 'POST') {
        return Response.json({ 
          error: '只支持POST方法' 
        }, { 
          status: 405,
          headers: corsHeaders 
        });
      }
      
      const pathParts = path.split('/');
      const folder = pathParts[3] || ''; // package 或 arc
      const fileName = decodeURIComponent(pathParts.slice(4).join('/'));
      
      if (!fileName) {
        return Response.json({
          success: false,
          error: '文件名不能为空'
        }, { headers: corsHeaders });
      }
      
      // 构建完整文件路径
      const filePath = folder ? `${folder}/${fileName}` : fileName;
      
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) {
          return Response.json({
            success: false,
            error: '没有找到文件'
          }, { headers: corsHeaders });
        }
        
        // 将文件上传到R2
        await env.R2_BUCKET.put(filePath, file.stream(), {
          httpMetadata: {
            contentType: file.type,
          },
        });
        
        return Response.json({
          success: true,
          message: '文件上传成功',
          filePath: filePath,
          size: file.size
        }, { headers: corsHeaders });
        
      } catch (error) {
        console.error('文件上传错误:', error);
        return Response.json({
          success: false,
          error: '文件上传失败: ' + error.message
        }, { 
          status: 500,
          headers: corsHeaders 
        });
      }
    }
    
    return Response.json({ 
      error: '不支持的R2操作',
      path: path 
    }, { 
      status: 404,
      headers: corsHeaders 
    });
    
  } catch (error) {
    console.error('R2代理错误:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { 
      status: 500,
      headers: corsHeaders 
    });
  }
}
