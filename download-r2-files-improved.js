const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
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
const DOWNLOAD_DIR = config.downloadDir;

// 确保下载目录存在
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log(`📁 创建下载目录: ${path.resolve(DOWNLOAD_DIR)}`);
}

// 检查文件是否为图片或视频
function isImageOrVideo(filename) {
  const ext = path.extname(filename).toLowerCase();
  return config.supportedExtensions.includes(ext);
}

// 下载单个文件
async function downloadFile(key, localPath) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    
    const response = await r2Client.send(command);
    const chunks = [];
    
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    const fileBuffer = Buffer.concat(chunks);
    fs.writeFileSync(localPath, fileBuffer);
    
    console.log(`✅ 下载成功: ${key} -> ${path.basename(localPath)}`);
    return true;
  } catch (error) {
    console.error(`❌ 下载失败: ${key} - ${error.message}`);
    return false;
  }
}

// 生成安全的文件名
function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*]/g, '_');
}

// 生成唯一的文件名
function generateUniqueFilename(basePath, filename) {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);
  const dir = path.dirname(basePath);
  
  let counter = 1;
  let finalPath = basePath;
  
  while (fs.existsSync(finalPath)) {
    finalPath = path.join(dir, `${name}_${counter}${ext}`);
    counter++;
  }
  
  return finalPath;
}

// 主函数
async function downloadAllFiles() {
  console.log('🚀 开始下载R2中的所有图片和视频文件...');
  console.log(`📁 下载目录: ${path.resolve(DOWNLOAD_DIR)}`);
  console.log(`🪣 存储桶: ${BUCKET_NAME}`);
  console.log(`🔗 端点: ${config.r2.endpoint}`);
  console.log('');
  
  let totalFiles = 0;
  let downloadedFiles = 0;
  let skippedFiles = 0;
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
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      });
      
      const response = await r2Client.send(command);
      const objects = response.Contents || [];
      
      console.log(`   找到 ${objects.length} 个对象`);
      
      for (const obj of objects) {
        const key = obj.Key;
        const filename = path.basename(key);
        
        // 跳过库存系统文件
        if (key.startsWith('arc/') || 
            key.startsWith('package-sync/') ||
            key.startsWith('wide/') ||
            key.startsWith('records/') ||
            key.startsWith('tmall/') ||
            key.startsWith('reorganization/')) {
          continue;
        }
        
        // 检查是否为图片或视频文件
        if (isImageOrVideo(filename)) {
          totalFiles++;
          
          // 生成本地文件路径
          const safeFilename = sanitizeFilename(filename);
          const basePath = path.join(DOWNLOAD_DIR, safeFilename);
          const finalPath = generateUniqueFilename(basePath, safeFilename);
          
          // 下载文件
          const success = await downloadFile(key, finalPath);
          if (success) {
            downloadedFiles++;
          } else {
            errorFiles++;
          }
          
          // 每下载10个文件显示一次进度
          if (totalFiles % 10 === 0) {
            console.log(`📊 进度: ${totalFiles} 个文件已处理, ${downloadedFiles} 个成功下载`);
          }
        }
      }
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log('\n🎉 下载完成!');
    console.log('='.repeat(50));
    console.log(`📊 统计信息:`);
    console.log(`   总文件数: ${totalFiles}`);
    console.log(`   成功下载: ${downloadedFiles}`);
    console.log(`   下载失败: ${errorFiles}`);
    console.log(`   跳过文件: ${skippedFiles}`);
    console.log(`   耗时: ${duration} 秒`);
    console.log(`   下载目录: ${path.resolve(DOWNLOAD_DIR)}`);
    console.log('='.repeat(50));
    
    if (downloadedFiles > 0) {
      console.log(`\n✅ 所有文件已下载到: ${path.resolve(DOWNLOAD_DIR)}`);
    }
    
  } catch (error) {
    console.error('❌ 下载过程中发生错误:', error);
    console.error('请检查您的R2配置是否正确');
  }
}

// 运行下载
if (require.main === module) {
  downloadAllFiles().catch(console.error);
}

module.exports = { downloadAllFiles };
