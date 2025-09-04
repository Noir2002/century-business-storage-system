// 简化的R2存储处理器 - 专注于Excel文件上传
class SimpleR2Storage {
  constructor() {
    this.baseUrl = (window.apiConfig && window.apiConfig.baseURL) ? window.apiConfig.baseURL : '';
  }

  getApiUrl(endpoint) {
    // endpoint should start with '/api'
    return this.baseUrl ? `${this.baseUrl}${endpoint}` : endpoint;
  }

  // 上传Excel文件到arc/文件夹
  async uploadExcelFile(file) {
    console.log('🔄 开始上传Excel文件:', file.name);
    
    try {
      // 验证文件类型
      if (!this.isExcelFile(file)) {
        throw new Error('只支持Excel文件(.xlsx, .xls)');
      }

      // 创建FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('description', `Excel文件: ${file.name}`);

      // 直接上传到后端（通过统一的 /api 路由，api-config.js 会按环境重定向）
      const response = await fetch(this.getApiUrl('/api/files/upload'), {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Excel文件上传成功:', result);
        return {
          success: true,
          fileInfo: result.file,
          message: '文件上传成功'
        };
      } else {
        console.error('❌ 上传失败:', result.error);
        throw new Error(result.error || '上传失败');
      }
    } catch (error) {
      console.error('❌ 上传Excel文件失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 验证是否为Excel文件
  isExcelFile(file) {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/excel',
      'application/x-excel'
    ];
    
    const allowedExtensions = ['.xlsx', '.xls'];
    const fileName = file.name.toLowerCase();
    
    return allowedTypes.includes(file.type) || 
           allowedExtensions.some(ext => fileName.endsWith(ext));
  }

  // 获取已上传的Excel文件列表
  async getExcelFilesList() {
    console.log('🔄 获取Excel文件列表...');
    
    try {
      const response = await fetch(this.getApiUrl('/api/files'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ 获取文件列表成功:', result.files);
        return {
          success: true,
          files: result.files || []
        };
      } else {
        throw new Error(result.error || '获取文件列表失败');
      }
    } catch (error) {
      console.error('❌ 获取文件列表失败:', error);
      return {
        success: false,
        error: error.message,
        files: []
      };
    }
  }

  // 显示上传进度和状态
  showUploadStatus(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // 如果页面有显示状态的元素，更新它
    const statusElement = document.getElementById('uploadStatus');
    if (statusElement) {
      statusElement.innerHTML = message;
      statusElement.className = `status ${type}`;
    }
  }

  // 格式化文件大小
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// 创建全局实例
window.simpleR2Storage = new SimpleR2Storage();

console.log('📦 Simple R2 Storage已加载');
