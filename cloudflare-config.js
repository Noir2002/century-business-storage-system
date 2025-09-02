// Cloudflare R2 配置
const CLOUDFLARE_CONFIG = {
    // R2存储配置
    r2: {
        accountId: 'your-account-id',
        accessKeyId: 'your-access-key-id',
        secretAccessKey: 'your-secret-access-key',
        bucketName: 'cb-file-storage',
        endpoint: 'https://your-account-id.r2.cloudflarestorage.com',
        publicUrl: 'https://files.centurybusiness.org'
    },
    
    // 域名配置
    domains: {
        main: 'centurybusiness.org',
        files: 'files.centurybusiness.org',
        api: 'api.centurybusiness.org'
    },
    
    // 文件配置
    files: {
        maxSize: 100 * 1024 * 1024, // 100MB
        allowedTypes: ['image/*', 'video/*', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        retentionDays: 30, // 30天自动清理
        buckets: {
            videos: 'videos',
            inventory: 'inventory',
            temp: 'temp'
        }
    }
};

// AWS SDK配置（Cloudflare R2兼容S3 API）
const R2_CLIENT_CONFIG = {
    region: 'auto',
    endpoint: CLOUDFLARE_CONFIG.r2.endpoint,
    credentials: {
        accessKeyId: CLOUDFLARE_CONFIG.r2.accessKeyId,
        secretAccessKey: CLOUDFLARE_CONFIG.r2.secretAccessKey
    },
    s3ForcePathStyle: true
};
