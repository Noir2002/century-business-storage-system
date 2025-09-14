const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// 尝试加载配置文件
let config;
try {
  config = require('./r2-config-token.js');
} catch (error) {
  console.log('⚠️ 未找到配置文件 r2-config-token.js');
  process.exit(1);
}

const BUCKET_NAME = config.bucketName;

// 移动单个文件
async function moveFileWithToken(sourceKey, destinationKey) {
  try {
    // 1. 先复制文件到新位置
    const copyUrl = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(destinationKey)}`;
    
    const copyResponse = await fetch(copyUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${config.cloudflare.token}`,
        'Content-Type': 'application/json',
        'X-Copy-Source': `/${BUCKET_NAME}/${encodeURIComponent(sourceKey)}`
      }
    });
    
    if (!copyResponse.ok) {
      const errorText = await copyResponse.text();
      throw new Error(`复制失败: ${copyResponse.status} ${errorText}`);
    }
    
    // 2. 删除原文件
    const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(sourceKey)}`;
    
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${config.cloudflare.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      throw new Error(`删除原文件失败: ${deleteResponse.status} ${errorText}`);
    }
    
    console.log(`✅ 移动成功: ${sourceKey} -> ${destinationKey}`);
    return true;
  } catch (error) {
    console.error(`❌ 移动失败: ${sourceKey} - ${error.message}`);
    return false;
  }
}

// 批量移动文件
async function batchMoveFiles(moveList) {
  console.log('🚀 开始批量移动文件...');
  console.log(`📋 计划移动 ${moveList.length} 个文件`);
  console.log('');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < moveList.length; i++) {
    const { source, destination } = moveList[i];
    console.log(`📁 移动 ${i + 1}/${moveList.length}: ${source}`);
    
    const success = await moveFileWithToken(source, destination);
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
    
    // 每移动10个文件显示一次进度
    if ((i + 1) % 10 === 0) {
      console.log(`📊 进度: ${i + 1}/${moveList.length} 完成, 成功: ${successCount}, 失败: ${errorCount}`);
    }
  }
  
  console.log('\n🎉 批量移动完成!');
  console.log(`📊 统计: 成功 ${successCount} 个, 失败 ${errorCount} 个`);
}

// 示例：将2025-09-14的文件移动到2025-09-10
async function moveFrom14To10() {
  const moveList = [
    {
      source: 'package/2025-09/2025-09-14/2025-09-14_0029/1757513130029-399240991.jpg',
      destination: 'package/2025-09/2025-09-10/2025-09-10_0029/1757513130029-399240991.jpg'
    },
    {
      source: 'package/2025-09/2025-09-14/2025-09-14_0207/1756741160207_0_sj5s_1000008442.mp4',
      destination: 'package/2025-09/2025-09-10/2025-09-10_0207/1756741160207_0_sj5s_1000008442.mp4'
    }
    // 可以添加更多文件...
  ];
  
  await batchMoveFiles(moveList);
}

// 运行示例
if (require.main === module) {
  moveFrom14To10().catch(console.error);
}

module.exports = { moveFileWithToken, batchMoveFiles };
