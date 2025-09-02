// 设置R2存储桶CORS策略的脚本
const CLOUDFLARE_API_TOKEN = 'ucKoqfP3F3w38eAlDj-12hqCBAEG10S5SpcijzC3';
const ACCOUNT_ID = '23441d4f7734b84186c4c20ddefef8e7';
const BUCKET_NAME = 'century-business-system';

const corsConfiguration = [
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
];

async function setupR2CORS() {
  try {
    console.log('🔧 正在设置R2存储桶CORS策略...');
    
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/cors`;
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(corsConfiguration)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ R2 CORS策略设置成功！');
      console.log('配置详情:', JSON.stringify(result, null, 2));
    } else {
      console.error('❌ CORS设置失败:', result);
    }
    
    return result;
  } catch (error) {
    console.error('❌ 设置CORS时出错:', error);
    return { success: false, error: error.message };
  }
}

// 如果在Node.js环境中运行
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { setupR2CORS };
}

// 如果在浏览器中运行
if (typeof window !== 'undefined') {
  window.setupR2CORS = setupR2CORS;
}

console.log('CORS设置脚本已加载，请调用 setupR2CORS() 函数');
