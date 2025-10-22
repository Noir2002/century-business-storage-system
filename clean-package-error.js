const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const readline = require('readline');

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
const ERROR_PREFIX = 'package/package/'; // 错误的文件夹路径

// 创建readline接口用于用户确认
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 询问用户确认
function askConfirmation(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// 列出指定前缀下的所有文件
async function listFiles(prefix) {
  const files = [];
  let continuationToken;
  
  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000
    });
    
    const response = await r2Client.send(command);
    const objects = response.Contents || [];
    
    files.push(...objects.map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified
    })));
    
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  
  return files;
}

// 删除单个文件
async function deleteFile(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    
    await r2Client.send(command);
    return true;
  } catch (error) {
    console.error(`❌ 删除失败: ${key} - ${error.message}`);
    return false;
  }
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 主函数
async function cleanErrorFolder() {
  console.log('🧹 清理 R2 中的错误文件夹');
  console.log('='.repeat(60));
  console.log(`🪣 存储桶: ${BUCKET_NAME}`);
  console.log(`📁 目标路径: ${ERROR_PREFIX}`);
  console.log('');
  
  try {
    // 1. 列出所有文件
    console.log('📋 正在扫描文件夹...\n');
    const files = await listFiles(ERROR_PREFIX);
    
    if (files.length === 0) {
      console.log('✅ 没有找到需要删除的文件，文件夹已经是干净的！');
      rl.close();
      return;
    }
    
    // 2. 显示文件列表
    console.log(`⚠️ 发现 ${files.length} 个文件需要删除：\n`);
    
    let totalSize = 0;
    files.slice(0, 10).forEach((file, index) => {
      console.log(`${index + 1}. ${file.key}`);
      console.log(`   大小: ${formatFileSize(file.size)} | 修改时间: ${file.lastModified.toLocaleString('zh-CN')}`);
      totalSize += file.size;
    });
    
    if (files.length > 10) {
      console.log(`\n... 还有 ${files.length - 10} 个文件未显示`);
      files.slice(10).forEach(file => {
        totalSize += file.size;
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`📊 总计: ${files.length} 个文件, 总大小: ${formatFileSize(totalSize)}`);
    console.log('='.repeat(60));
    
    // 3. 请求用户确认
    console.log('\n⚠️ 警告: 此操作将永久删除这些文件，无法恢复！\n');
    const confirmed = await askConfirmation('确定要删除这些文件吗？(y/n): ');
    
    if (!confirmed) {
      console.log('\n❌ 操作已取消');
      rl.close();
      return;
    }
    
    // 4. 执行删除
    console.log('\n🗑️ 开始删除文件...\n');
    const startTime = Date.now();
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const success = await deleteFile(file.key);
      
      if (success) {
        deletedCount++;
        console.log(`✅ [${i + 1}/${files.length}] 已删除: ${file.key}`);
      } else {
        errorCount++;
        console.log(`❌ [${i + 1}/${files.length}] 删除失败: ${file.key}`);
      }
      
      // 显示进度
      if ((i + 1) % 10 === 0) {
        const progress = Math.round((i + 1) / files.length * 100);
        console.log(`\n📊 进度: ${progress}% (${deletedCount} 个成功, ${errorCount} 个失败)\n`);
      }
    }
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    // 5. 显示结果
    console.log('\n' + '='.repeat(60));
    console.log('🎉 清理完成！');
    console.log('='.repeat(60));
    console.log(`📊 统计信息:`);
    console.log(`   扫描文件: ${files.length} 个`);
    console.log(`   成功删除: ${deletedCount} 个`);
    console.log(`   删除失败: ${errorCount} 个`);
    console.log(`   耗时: ${duration} 秒`);
    console.log('='.repeat(60));
    
    if (deletedCount === files.length) {
      console.log('\n✅ 所有文件已成功删除！错误文件夹已清理干净。');
    } else if (deletedCount > 0) {
      console.log(`\n⚠️ 部分文件删除失败，请检查日志并重试。`);
    }
    
  } catch (error) {
    console.error('\n❌ 清理过程中发生错误:', error);
    console.error('错误详情:', error.message);
  } finally {
    rl.close();
  }
}

// 运行清理
if (require.main === module) {
  cleanErrorFolder().catch(error => {
    console.error('❌ 程序异常:', error);
    rl.close();
    process.exit(1);
  });
}

module.exports = { cleanErrorFolder };

