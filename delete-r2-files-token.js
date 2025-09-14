const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// 尝试加载配置文件
let config;
try {
  config = require('./r2-config-token.js');
} catch (error) {
  console.log('⚠️ 未找到配置文件 r2-config-token.js');
  console.log('请复制 r2-config-token.js 并填入您的配置');
  process.exit(1);
}

const BUCKET_NAME = config.bucketName;
const DOWNLOAD_DIR = config.downloadDir;
const TARGET_PREFIX = 'package/2025-09/2025-09-14/';

// 使用Cloudflare API删除文件
async function deleteFileWithToken(key) {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(key)}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${config.cloudflare.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      console.log(`✅ 删除成功: ${key}`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`❌ 删除失败: ${key} - ${response.status} ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ 删除失败: ${key} - ${error.message}`);
    return false;
  }
}

// 列出所有文件（包括文件夹内的文件）
async function listFilesWithToken() {
  try {
    const allObjects = [];
    let cursor = '';
    
    do {
      let url = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/r2/buckets/${BUCKET_NAME}/objects?prefix=${encodeURIComponent(TARGET_PREFIX)}`;
      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.cloudflare.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status} ${await response.text()}`);
      }
      
      const data = await response.json();
      const objects = data.result || [];
      allObjects.push(...objects);
      
      cursor = data.result_info?.cursor || '';
      console.log(`   已获取 ${allObjects.length} 个对象...`);
      
    } while (cursor);
    
    return allObjects;
  } catch (error) {
    console.error('❌ 列出文件失败:', error);
    throw error;
  }
}

// 主函数
async function deleteAllFiles() {
  console.log('🗑️ 开始删除R2中的2025-09-14文件夹内容...');
  console.log(`🪣 存储桶: ${BUCKET_NAME}`);
  console.log(`📁 目标路径: ${TARGET_PREFIX}`);
  console.log(`🔑 使用Token: ${config.cloudflare.token.substring(0, 10)}...`);
  console.log('');
  
  let totalFiles = 0;
  let deletedFiles = 0;
  let errorFiles = 0;
  
  const startTime = Date.now();
  
  try {
    // 列出所有文件
    console.log('📄 正在获取文件列表...');
    const objects = await listFilesWithToken();
    
    console.log(`   找到 ${objects.length} 个对象`);
    
    if (objects.length === 0) {
      console.log('✅ 没有找到需要删除的文件');
      return;
    }
    
    // 删除每个文件
    for (const obj of objects) {
      const key = obj.key;
      totalFiles++;
      
      const success = await deleteFileWithToken(key);
      if (success) {
        deletedFiles++;
      } else {
        errorFiles++;
      }
      
      // 每删除10个文件显示一次进度
      if (totalFiles % 10 === 0) {
        console.log(`📊 进度: ${totalFiles} 个文件已处理, ${deletedFiles} 个成功删除`);
      }
    }
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log('\n🎉 删除完成!');
    console.log('='.repeat(50));
    console.log(`📊 统计信息:`);
    console.log(`   总文件数: ${totalFiles}`);
    console.log(`   成功删除: ${deletedFiles}`);
    console.log(`   删除失败: ${errorFiles}`);
    console.log(`   耗时: ${duration} 秒`);
    console.log('='.repeat(50));
    
    if (deletedFiles > 0) {
      console.log(`\n✅ 已成功删除 ${deletedFiles} 个文件`);
    }
    
  } catch (error) {
    console.error('❌ 删除过程中发生错误:', error);
    console.error('请检查您的Token和Account ID是否正确');
  }
}

// 运行删除
if (require.main === module) {
  deleteAllFiles().catch(console.error);
}

module.exports = { deleteAllFiles };
