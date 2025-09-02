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
  if (path === '/api/files' && method === 'GET') {
    // 模拟文件列表
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
    
    return Response.json({ success: true, files: mockFiles });
  }
  
  return Response.json({ error: '文件API暂未完全实现' }, { status: 501 });
}
