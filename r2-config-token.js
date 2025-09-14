// 使用Cloudflare Token的R2配置
module.exports = {
  // 使用Cloudflare Token的方式
  cloudflare: {
    token: 'NzAWLCtCOBzntfrRZjwVlw6rrDtG3_GJQKFw0luO',
    accountId: '23441d4f7734b84186c4c20ddefef8e7'
  },
  
  // 存储桶名称
  bucketName: 'century-business-system',
  
  // 下载目录
  downloadDir: './2025-09-14',
  
  // 支持的图片和视频文件扩展名
  supportedExtensions: [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg',
    '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v'
  ]
};
