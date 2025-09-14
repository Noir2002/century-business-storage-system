// Cloudflare Worker脚本：重新组织R2文件
// 将直接存储在bucket根目录的文件移动到正确的文件夹结构中

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

    if (method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

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
      }
      
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Reorganization Error:', error);
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

// 开始重新组织过程
async function startReorganization(env, corsHeaders) {
  console.log('🚀 开始文件重新组织...');
  
  try {
    if (!env.R2_BUCKET) {
      throw new Error('R2存储桶不可用');
    }

    // 获取所有文件
    const allObjects = await env.R2_BUCKET.list({ limit: 1000 });
    const filesToMove = [];
    
    // 识别需要移动的文件（只处理打包系统的文件）
    for (const obj of allObjects.objects) {
      // 跳过库存系统文件
      if (obj.key.startsWith('arc/') || 
          obj.key.startsWith('package-sync/') ||
          obj.key.startsWith('wide/') ||
          obj.key.startsWith('records/') ||
          obj.key.startsWith('tmall/')) {
        continue;
      }
      
      // 只处理以下类型的文件：
      // 1. 直接存储在根目录的图片和视频文件
      // 2. 以日期格式命名的文件夹中的文件
      // 3. 不在package/文件夹中的打包系统文件
      const isImageOrVideo = obj.httpMetadata?.contentType?.startsWith('image/') || 
                            obj.httpMetadata?.contentType?.startsWith('video/');
      const isDateFolderFile = /^\d{8}_[^/]+\//.test(obj.key);
      const isRootFile = !obj.key.includes('/');
      const isNotInPackage = !obj.key.startsWith('package/');
      
      if ((isImageOrVideo && isRootFile) || 
          (isDateFolderFile && isNotInPackage) ||
          (isRootFile && isNotInPackage && (isImageOrVideo || obj.key.match(/\.(jpg|jpeg|png|gif|mp4|avi|mov)$/i)))) {
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
      const newPath = generateNewPath(file.key, file.uploaded);
      return {
        source: file.key,
        destination: newPath,
        size: file.size,
        contentType: file.contentType
      };
    });

    // 存储移动计划到R2
    await env.R2_BUCKET.put('reorganization/plan.json', JSON.stringify({
      plan: movePlan,
      totalFiles: movePlan.length,
      createdAt: new Date().toISOString(),
      status: 'pending'
    }), {
      httpMetadata: { contentType: 'application/json' }
    });

    return Response.json({
      success: true,
      message: `找到 ${movePlan.length} 个文件需要重新组织`,
      totalFiles: movePlan.length,
      plan: movePlan.slice(0, 10) // 只返回前10个作为预览
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
    for (const item of plan.plan) {
      const destObj = await env.R2_BUCKET.get(item.destination);
      if (destObj) {
        movedCount++;
      }
    }

    return Response.json({
      success: true,
      status: plan.status,
      totalFiles: plan.totalFiles,
      movedFiles: movedCount,
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

    // 生成新路径
    const newPath = generateNewPath(fileKey, sourceObj.uploaded);
    
    // 检查目标文件是否已存在
    const destObj = await env.R2_BUCKET.get(newPath);
    if (destObj) {
      return Response.json({
        success: false,
        error: '目标文件已存在'
      }, { status: 409, headers: corsHeaders });
    }

    // 复制文件到新位置
    await env.R2_BUCKET.put(newPath, sourceObj.body, {
      httpMetadata: sourceObj.httpMetadata,
      customMetadata: {
        ...sourceObj.customMetadata,
        originalPath: fileKey,
        movedAt: new Date().toISOString()
      }
    });

    // 删除原文件
    await env.R2_BUCKET.delete(fileKey);

    console.log(`✅ 文件移动成功: ${fileKey} -> ${newPath}`);

    return Response.json({
      success: true,
      message: '文件移动成功',
      source: fileKey,
      destination: newPath
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
function generateNewPath(fileName, uploadTime) {
  // 尝试从文件名提取日期和履约单号
  const dateContractMatch = fileName.match(/^(\d{8})_([^_]+)_/);
  
  if (dateContractMatch) {
    const dateStr = dateContractMatch[1];
    const contract = dateContractMatch[2];
    
    // 将YYYYMMDD转换为YYYY-MM-DD格式
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const yearMonth = `${year}-${month}`;
    const yearMonthDay = `${year}-${month}-${day}`;
    
    return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${contract}/${fileName}`;
  }
  
  // 如果没有匹配到，使用上传时间推断日期
  const uploadDate = new Date(uploadTime);
  const year = uploadDate.getFullYear();
  const month = String(uploadDate.getMonth() + 1).padStart(2, '0');
  const day = String(uploadDate.getDate()).padStart(2, '0');
  const yearMonth = `${year}-${month}`;
  const yearMonthDay = `${year}-${month}-${day}`;
  
  // 生成一个基于文件名的默认履约单号
  const defaultContract = `DEFAULT_${fileName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}`;
  
  return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${defaultContract}/${fileName}`;
}
