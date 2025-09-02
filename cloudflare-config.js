// Cloudflare R2 Storage Configuration
class CloudflareR2Config {
  constructor() {
    // 这些值需要从您的Cloudflare仪表板获取
    this.config = {
      // API Token - 从Cloudflare API Tokens页面创建
      apiToken: 'ucKoqfP3F3w38eAlDj-12hqCBAEG10S5SpcijzC3',
      
      // Account ID - 在Cloudflare仪表板右侧边栏可以找到
      accountId: '23441d4f7734b84186c4c20ddefef8e7',
      
      // 存储桶名称
      bucketName: 'century-business-system',
      
      // R2 API端点
      endpoint: 'https://api.cloudflare.com/client/v4',
      
      // 自定义域名（如果设置了的话）
      customDomain: 'files.centurybusiness.org', // 可选
      
      // 文件生命周期设置
      fileLifecycleDays: 30
    };
  }

  // 获取配置
  getConfig() {
    return this.config;
  }

  // 验证配置是否完整
  validateConfig() {
    const required = ['apiToken', 'accountId', 'bucketName'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      throw new Error(`缺少必需的配置项: ${missing.join(', ')}`);
    }
    
    return true;
  }

  // 更新配置
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return this.config;
  }
}

// 导出配置实例
window.CloudflareR2Config = CloudflareR2Config;

// 使用示例：
// const r2Config = new CloudflareR2Config();
// r2Config.updateConfig({
//   apiToken: 'your_actual_token_here',
//   accountId: 'your_actual_account_id_here'
// });