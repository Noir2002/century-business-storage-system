const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// 尝试加载配置文件
let config;
try {
  config = require('./r2-config.js');
} catch (error) {
  console.log('⚠️ 未找到配置文件 r2-config.js，使用默认配置');
  console.log('请复制 r2-config.example.js 为 r2-config.js 并填入您的配置');
  process.exit(1);
}

// 配置R2连接
const r2Client = new S3Client({
  region: config.r2.region,
  endpoint: config.r2.endpoint,
  credentials: config.r2.credentials
});

const BUCKET_NAME = config.bucketName;
const TARGET_PREFIX = 'package/2025-09/2025-09-14/';

// 删除单个文件
async function deleteFile(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    
    await r2Client.send(command);
    console.log(`✅ 删除成功: ${key}`);
    return true;
  } catch (error) {
    console.error(`❌ 删除失败: ${key} - ${error.message}`);
    return false;
  }
}

// 主函数
async function deleteAllFiles() {
  console.log('🗑️ 开始删除R2中的2025-09-14文件夹内容...');
  console.log(`🪣 存储桶: ${BUCKET_NAME}`);
  console.log(`📁 目标路径: ${TARGET_PREFIX}`);
  console.log('');
  
  let totalFiles = 0;
  let deletedFiles = 0;
  let errorFiles = 0;
  
  const startTime = Date.now();
  
  try {
    // 列出所有对象
    let continuationToken;
    let pageCount = 0;
    
    do {
      pageCount++;
      console.log(`📄 正在处理第 ${pageCount} 页...`);
      
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: TARGET_PREFIX,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      });
      
      const response = await r2Client.send(command);
      const objects = response.Contents || [];
      
      console.log(`   找到 ${objects.length} 个对象`);
      
      for (const obj of objects) {
        const key = obj.Key;
        totalFiles++;
        
        // 删除文件
        const success = await deleteFile(key);
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
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
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
    console.error('请检查您的R2配置是否正确');
  }
}

// 运行删除
if (require.main === module) {
  deleteAllFiles().catch(console.error);
}

module.exports = { deleteAllFiles };
