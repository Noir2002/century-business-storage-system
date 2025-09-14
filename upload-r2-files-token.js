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

// 上传单个文件
async function uploadFileWithToken(localPath, r2Key) {
  try {
    // 读取本地文件
    const fileBuffer = fs.readFileSync(localPath);
    const fileName = path.basename(localPath);
    const fileExt = path.extname(fileName).toLowerCase();
    
    // 根据文件扩展名确定Content-Type
    let contentType = 'application/octet-stream';
    if (['.jpg', '.jpeg'].includes(fileExt)) contentType = 'image/jpeg';
    else if (fileExt === '.png') contentType = 'image/png';
    else if (fileExt === '.gif') contentType = 'image/gif';
    else if (fileExt === '.mp4') contentType = 'video/mp4';
    else if (fileExt === '.avi') contentType = 'video/avi';
    else if (fileExt === '.mov') contentType = 'video/quicktime';
    
    const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(r2Key)}`;
    
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${config.cloudflare.token}`,
        'Content-Type': contentType
      },
      body: fileBuffer
    });
    
    if (response.ok) {
      console.log(`✅ 上传成功: ${fileName} -> ${r2Key}`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`❌ 上传失败: ${fileName} - ${response.status} ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ 上传失败: ${localPath} - ${error.message}`);
    return false;
  }
}

// 批量上传文件
async function batchUploadFiles(uploadList) {
  console.log('🚀 开始批量上传文件...');
  console.log(`📋 计划上传 ${uploadList.length} 个文件`);
  console.log('');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < uploadList.length; i++) {
    const { localPath, r2Key } = uploadList[i];
    const fileName = path.basename(localPath);
    console.log(`📁 上传 ${i + 1}/${uploadList.length}: ${fileName}`);
    
    // 检查本地文件是否存在
    if (!fs.existsSync(localPath)) {
      console.error(`❌ 本地文件不存在: ${localPath}`);
      errorCount++;
      continue;
    }
    
    const success = await uploadFileWithToken(localPath, r2Key);
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
    
    // 每上传10个文件显示一次进度
    if ((i + 1) % 10 === 0) {
      console.log(`📊 进度: ${i + 1}/${uploadList.length} 完成, 成功: ${successCount}, 失败: ${errorCount}`);
    }
  }
  
  console.log('\n🎉 批量上传完成!');
  console.log(`📊 统计: 成功 ${successCount} 个, 失败 ${errorCount} 个`);
}

// 从本地文件夹批量上传
async function uploadFromLocalFolder(localFolder, r2Prefix = '') {
  console.log(`📁 扫描本地文件夹: ${localFolder}`);
  
  if (!fs.existsSync(localFolder)) {
    console.error(`❌ 本地文件夹不存在: ${localFolder}`);
    return;
  }
  
  const files = fs.readdirSync(localFolder, { withFileTypes: true });
  const uploadList = [];
  
  for (const file of files) {
    if (file.isFile()) {
      const localPath = path.join(localFolder, file.name);
      const r2Key = r2Prefix ? `${r2Prefix}/${file.name}` : file.name;
      uploadList.push({ localPath, r2Key });
    }
  }
  
  console.log(`📋 找到 ${uploadList.length} 个文件需要上传`);
  
  if (uploadList.length > 0) {
    await batchUploadFiles(uploadList);
  } else {
    console.log('✅ 没有找到文件需要上传');
  }
}

// 示例：上传2025-09-10文件夹到R2
async function uploadExample() {
  const localFolder = './2025-09-10';
  const r2Prefix = 'package/2025-09/2025-09-10/uploaded';
  
  await uploadFromLocalFolder(localFolder, r2Prefix);
}

// 运行示例
if (require.main === module) {
  uploadExample().catch(console.error);
}

module.exports = { uploadFileWithToken, batchUploadFiles, uploadFromLocalFolder };
