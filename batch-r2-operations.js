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

// 通用批量操作类
class R2BatchOperations {
  constructor() {
    this.token = config.cloudflare.token;
    this.accountId = config.cloudflare.accountId;
  }

  // 列出文件
  async listFiles(prefix = '') {
    const allObjects = [];
    let cursor = '';
    
    do {
      let url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/r2/buckets/${BUCKET_NAME}/objects`;
      if (prefix) {
        url += `?prefix=${encodeURIComponent(prefix)}`;
      }
      if (cursor) {
        url += prefix ? '&' : '?';
        url += `cursor=${encodeURIComponent(cursor)}`;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
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
      
    } while (cursor);
    
    return allObjects;
  }

  // 删除文件
  async deleteFile(key) {
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(key)}`;
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error(`删除失败: ${key} - ${error.message}`);
      return false;
    }
  }

  // 移动文件（复制+删除）
  async moveFile(sourceKey, destinationKey) {
    try {
      // 1. 复制文件
      const copyUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(destinationKey)}`;
      
      const copyResponse = await fetch(copyUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'X-Copy-Source': `/${BUCKET_NAME}/${encodeURIComponent(sourceKey)}`
        }
      });
      
      if (!copyResponse.ok) {
        throw new Error(`复制失败: ${copyResponse.status}`);
      }
      
      // 2. 删除原文件
      const deleteSuccess = await this.deleteFile(sourceKey);
      if (!deleteSuccess) {
        throw new Error('删除原文件失败');
      }
      
      return true;
    } catch (error) {
      console.error(`移动失败: ${sourceKey} - ${error.message}`);
      return false;
    }
  }

  // 上传文件
  async uploadFile(localPath, r2Key) {
    try {
      const fileBuffer = fs.readFileSync(localPath);
      const fileExt = path.extname(localPath).toLowerCase();
      
      let contentType = 'application/octet-stream';
      if (['.jpg', '.jpeg'].includes(fileExt)) contentType = 'image/jpeg';
      else if (fileExt === '.png') contentType = 'image/png';
      else if (fileExt === '.gif') contentType = 'image/gif';
      else if (fileExt === '.mp4') contentType = 'video/mp4';
      else if (fileExt === '.avi') contentType = 'video/avi';
      else if (fileExt === '.mov') contentType = 'video/quicktime';
      
      const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(r2Key)}`;
      
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': contentType
        },
        body: fileBuffer
      });
      
      return response.ok;
    } catch (error) {
      console.error(`上传失败: ${localPath} - ${error.message}`);
      return false;
    }
  }

  // 批量操作
  async batchOperation(operations) {
    console.log(`🚀 开始批量操作: ${operations.length} 个任务`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      console.log(`📁 操作 ${i + 1}/${operations.length}: ${op.type} ${op.source || op.localPath}`);
      
      let success = false;
      
      switch (op.type) {
        case 'delete':
          success = await this.deleteFile(op.key);
          break;
        case 'move':
          success = await this.moveFile(op.source, op.destination);
          break;
        case 'upload':
          success = await this.uploadFile(op.localPath, op.r2Key);
          break;
        default:
          console.error(`未知操作类型: ${op.type}`);
      }
      
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
      
      if ((i + 1) % 10 === 0) {
        console.log(`📊 进度: ${i + 1}/${operations.length} 完成, 成功: ${successCount}, 失败: ${errorCount}`);
      }
    }
    
    console.log('\n🎉 批量操作完成!');
    console.log(`📊 统计: 成功 ${successCount} 个, 失败 ${errorCount} 个`);
    
    return { successCount, errorCount };
  }
}

// 示例用法
async function example() {
  const r2 = new R2BatchOperations();
  
  // 示例1: 列出所有文件
  console.log('📋 列出所有文件...');
  const allFiles = await r2.listFiles();
  console.log(`找到 ${allFiles.length} 个文件`);
  
  // 示例2: 批量移动文件
  const moveOperations = [
    {
      type: 'move',
      source: 'package/2025-09/2025-09-14/old-file.jpg',
      destination: 'package/2025-09/2025-09-10/new-file.jpg'
    }
    // 可以添加更多移动操作...
  ];
  
  // await r2.batchOperation(moveOperations);
  
  // 示例3: 批量上传本地文件
  const uploadOperations = [
    {
      type: 'upload',
      localPath: './local-file.jpg',
      r2Key: 'package/2025-09/2025-09-10/uploaded-file.jpg'
    }
    // 可以添加更多上传操作...
  ];
  
  // await r2.batchOperation(uploadOperations);
}

// 运行示例
if (require.main === module) {
  example().catch(console.error);
}

module.exports = R2BatchOperations;
