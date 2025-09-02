// 打包系统的R2存储适配器
class R2PackageStorage {
  constructor() {
    this.baseURL = 'https://century-business-api.anthonin815.workers.dev';
  }

  // 上传文件到package/文件夹
  async uploadFile(file, folderPath = '') {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // 构建文件路径
      const fileName = file.name;
      const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
      
      const response = await fetch(`${this.baseURL}/api/r2/upload/package/${encodeURIComponent(fullPath)}`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ 文件上传成功: ${fullPath}`);
        return {
          success: true,
          filePath: result.filePath,
          size: result.size,
          message: result.message
        };
      } else {
        console.error(`❌ 文件上传失败: ${result.error}`);
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      console.error('上传错误:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 批量上传文件
  async uploadFiles(files, folderPath = '', progressCallback = null) {
    const results = [];
    const total = files.length;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: total,
          fileName: file.name,
          progress: Math.round(((i + 1) / total) * 100)
        });
      }
      
      const result = await this.uploadFile(file, folderPath);
      results.push({
        fileName: file.name,
        ...result
      });
      
      // 避免请求过于频繁
      if (i < files.length - 1) {
        await this.sleep(500); // 等待500ms
      }
    }
    
    return results;
  }

  // 获取package/文件夹下的文件列表
  async listFiles(prefix = '') {
    try {
      const params = new URLSearchParams({
        folder: 'package',
        limit: '1000'
      });
      
      if (prefix) {
        params.append('prefix', prefix);
      }
      
      const response = await fetch(`${this.baseURL}/api/r2/list-files?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          files: result.files || []
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      console.error('获取文件列表失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 删除文件
  async deleteFile(filePath) {
    try {
      // 确保文件路径包含package/前缀
      const fullPath = filePath.startsWith('package/') ? filePath : `package/${filePath}`;
      
      const response = await fetch(`${this.baseURL}/api/r2/delete/${encodeURIComponent(fullPath)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ 文件删除成功: ${fullPath}`);
        return {
          success: true,
          message: result.message
        };
      } else {
        console.error(`❌ 文件删除失败: ${result.error}`);
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      console.error('删除文件失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 获取文件的公共URL
  async getPublicUrl(filePath) {
    try {
      // 确保文件路径包含package/前缀
      const fullPath = filePath.startsWith('package/') ? filePath.replace('package/', '') : filePath;
      
      const params = new URLSearchParams({
        folder: 'package'
      });
      
      const response = await fetch(`${this.baseURL}/api/r2/public-url/${encodeURIComponent(fullPath)}?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (result.success) {
        return result.url;
      } else {
        // 回退到默认URL生成
        return `https://century-business-system.23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/package/${fullPath}`;
      }
    } catch (error) {
      console.error('获取公共URL失败:', error);
      // 回退到默认URL生成
      const fullPath = filePath.startsWith('package/') ? filePath.replace('package/', '') : filePath;
      return `https://century-business-system.23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/package/${fullPath}`;
    }
  }

  // 获取存储统计信息
  async getStorageStats() {
    try {
      const listResult = await this.listFiles();
      
      if (listResult.success) {
        const files = listResult.files;
        const totalFiles = files.length;
        const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
        
        // 计算今日上传数量
        const today = new Date().toDateString();
        const todayUploads = files.filter(file => {
          const fileDate = new Date(file.uploaded || file.lastModified).toDateString();
          return fileDate === today;
        }).length;
        
        return {
          totalFiles,
          totalSize,
          todayUploads,
          formattedSize: this.formatFileSize(totalSize)
        };
      } else {
        return {
          totalFiles: 0,
          totalSize: 0,
          todayUploads: 0,
          formattedSize: '0 B'
        };
      }
    } catch (error) {
      console.error('获取存储统计失败:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        todayUploads: 0,
        formattedSize: '0 B'
      };
    }
  }

  // 格式化文件大小
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 延迟函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出到全局
window.R2PackageStorage = R2PackageStorage;

// 创建全局实例
window.r2PackageStorage = new R2PackageStorage();

console.log('📦 R2 打包系统存储适配器已加载');
