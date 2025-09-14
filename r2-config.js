// R2配置模板
// 请复制此文件为 r2-config.js 并填入您的实际配置

module.exports = {
  // Cloudflare R2配置
  r2: {
    region: 'auto',
    endpoint: 'https://your-account-id.r2.cloudflarestorage.com', // 替换为您的R2端点
    credentials: {
      accessKeyId: 'your-access-key-id', // 替换为您的访问密钥ID
      secretAccessKey: 'NzAWLCtCOBzntfrRZjwVlw6rrDtG3_GJQKFw0luO'
    }
  },
  
  // 存储桶名称
  bucketName: 'century-business-system',
  
  // 下载目录
  downloadDir: './2025-09-10',
  
  // 支持的图片和视频文件扩展名
  supportedExtensions: [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg',
    '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v'
  ]
};
