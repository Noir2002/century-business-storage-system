// API配置 - 自动检测环境并使用正确的API地址
class APIConfig {
  constructor() {
    // 检测当前环境
    this.isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    this.isPages = window.location.hostname.includes('.pages.dev');
    // 允许通过 query/localStorage 覆盖后端类型：workers | local
    const search = new URLSearchParams(window.location.search);
    const queryOverride = search.get('api');
    const storageOverride = localStorage.getItem('apiBaseOverride');
    const override = (queryOverride || storageOverride || '').toLowerCase();
    
    // 根据环境设置API基础URL（终极方案：同源 Worker 托管）
    if (override === 'workers') {
      this.baseURL = 'https://century-business-system.anthonin815.workers.dev';
    } else if (override === 'local') {
      this.baseURL = 'http://localhost:3000';
    } else {
      if (this.isLocal) {
        this.baseURL = 'http://localhost:3000';
      } else if (this.isPages) {
        // 在 Pages 环境可以继续指向 Workers 子域（使用正确的Worker名称）
        this.baseURL = 'https://century-business-system.anthonin815.workers.dev';
      } else {
        // 对于自定义域名，检查是否有存储的Worker URL，否则使用默认
        const storedWorkerUrl = localStorage.getItem('workerBaseURL');
        if (storedWorkerUrl) {
          this.baseURL = storedWorkerUrl;
        } else {
          // 使用正确的Worker URL
          this.baseURL = 'https://century-business-system.anthonin815.workers.dev';
        }
      }
    }
    
    console.log('🔧 API配置:', {
      环境: this.isLocal ? '本地开发' : (this.isPages ? 'Cloudflare Pages' : '未知'),
      API地址: this.baseURL,
      覆盖: override || '无'
    });
  }
  
  // 获取完整的API URL
  getAPIUrl(endpoint) {
    return `${this.baseURL}/api${endpoint}`;
  }
  
  // 发送API请求
  async request(endpoint, options = {}) {
    const url = this.getAPIUrl(endpoint);
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    try {
      console.log(`🌐 API请求: ${finalOptions.method || 'GET'} ${url}`);
      const response = await fetch(url, finalOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`✅ API响应:`, data);
      return data;
    } catch (error) {
      console.error(`❌ API错误 (${url}):`, error);
      
      // 如果是Pages环境且API失败，提示用户
      if (this.isPages && !this.isLocal) {
        console.warn('⚠️ 可能的原因: Cloudflare Workers后端尚未部署或配置不正确');
      }
      
      throw error;
    }
  }
  
  // 设置Worker URL的便捷方法
  setWorkerURL(workerUrl) {
    this.baseURL = workerUrl;
    localStorage.setItem('workerBaseURL', workerUrl);
    console.log('✅ Worker URL已更新:', this.baseURL);
  }
  
  // 便捷方法
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }
  
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
  
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

// 全局API实例
window.apiConfig = new APIConfig();

// 兼容性：保持原有的fetch调用方式
window.originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  // 如果是相对路径的API调用，自动转换
  if (typeof url === 'string' && url.startsWith('/api/')) {
    const fullUrl = window.apiConfig.getAPIUrl(url.substring(4)); // 移除 '/api' 前缀
    console.log(`🔄 重定向API调用: ${url} -> ${fullUrl}`);
    return window.originalFetch(fullUrl, options);
  }
  
  // 其他请求保持原样
  return window.originalFetch(url, options);
};
