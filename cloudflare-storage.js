// Cloudflare R2 Storage Operations
class CloudflareR2Storage {
  constructor() {
    this.config = new CloudflareR2Config().getConfig();
    this.baseUrl = `${this.config.endpoint}/accounts/${this.config.accountId}/r2/buckets/${this.config.bucketName}`;
  }

  // 获取认证头
  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.config.apiToken}`,
      'Content-Type': 'application/json'
    };
  }

  // 测试连接
  async testConnection() {
    try {
      console.log('🔄 测试R2连接...');
      // 使用Workers代理而不是直接调用Cloudflare API
      const response = await fetch('/api/r2/test-connection', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ R2连接成功！');
        return data;
      } else {
        console.error('❌ R2连接失败:', data.error);
        return data;
      }
    } catch (error) {
      console.error('❌ 连接失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 上传文件
  async uploadFile(file, fileName, folder = '') {
    try {
      console.log(`🔄 上传文件: ${fileName}`);
      
      // 构建文件路径
      const filePath = folder ? `${folder}/${fileName}` : fileName;
      
      // 由于浏览器环境限制，这里使用预签名URL的方式
      // 实际的文件上传需要在服务器端实现
      const uploadUrl = `${this.baseUrl}/objects/${encodeURIComponent(filePath)}`;
      
      // 注意：这需要在服务器端实现，因为浏览器不能直接上传到R2
      console.log('📋 上传URL:', uploadUrl);
      console.log('⚠️ 注意：文件上传需要在服务器端实现');
      
      return {
        success: true,
        message: '上传URL已生成，需要服务器端实现实际上传',
        uploadUrl: uploadUrl,
        filePath: filePath
      };
      
    } catch (error) {
      console.error('❌ 上传失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 列出文件
  async listFiles(prefix = '', limit = 100) {
    try {
      console.log(`🔄 列出文件，前缀: ${prefix || '无'}`);
      
      const params = new URLSearchParams();
      if (prefix) {
        params.append('prefix', prefix);
      }
      params.append('limit', limit.toString());
      
      const response = await fetch(`/api/r2/list-files?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ 成功获取文件列表，共 ${data.files?.length || 0} 个文件`);
        return data;
      } else {
        console.error('❌ 获取文件列表失败:', data.error);
        return data;
      }
    } catch (error) {
      console.error('❌ 列出文件失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 删除文件
  async deleteFile(fileName) {
    try {
      console.log(`🔄 删除文件: ${fileName}`);
      
      const response = await fetch(`/api/r2/delete/${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ 文件删除成功');
        return data;
      } else {
        console.error('❌ 删除失败:', data.error);
        return data;
      }
    } catch (error) {
      console.error('❌ 删除文件失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 获取文件公共URL
  async getPublicUrl(fileName, folder = '') {
    try {
      const params = new URLSearchParams();
      if (folder) {
        params.append('folder', folder);
      }
      
      const response = await fetch(`/api/r2/public-url/${encodeURIComponent(fileName)}?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        return data.url;
      } else {
        // 回退到默认URL生成
        const filePath = folder ? `${folder}/${fileName}` : fileName;
        return `https://${this.config.bucketName}.${this.config.accountId}.r2.cloudflarestorage.com/${filePath}`;
      }
    } catch (error) {
      console.error('❌ 获取公共URL失败:', error);
      // 回退到默认URL生成
      const filePath = folder ? `${folder}/${fileName}` : fileName;
      return `https://${this.config.bucketName}.${this.config.accountId}.r2.cloudflarestorage.com/${filePath}`;
    }
  }

  // 清理过期文件（基于文件生命周期）
  async cleanupExpiredFiles() {
    try {
      console.log(`🔄 清理超过 ${this.config.fileLifecycleDays} 天的文件...`);
      
      const filesList = await this.listFiles();
      
      if (!filesList.success) {
        return filesList;
      }
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.fileLifecycleDays);
      
      const expiredFiles = filesList.files.filter(file => {
        const fileDate = new Date(file.uploaded);
        return fileDate < cutoffDate;
      });
      
      console.log(`📋 找到 ${expiredFiles.length} 个过期文件`);
      
      const deleteResults = [];
      for (const file of expiredFiles) {
        const result = await this.deleteFile(file.key);
        deleteResults.push({
          fileName: file.key,
          ...result
        });
      }
      
      const deletedCount = deleteResults.filter(r => r.success).length;
      
      console.log(`✅ 成功删除 ${deletedCount} 个过期文件`);
      
      return {
        success: true,
        message: `清理完成，删除了 ${deletedCount} 个过期文件`,
        expiredFiles: expiredFiles.length,
        deletedFiles: deletedCount,
        results: deleteResults
      };
      
    } catch (error) {
      console.error('❌ 清理过期文件失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// 导出到全局
window.CloudflareR2Storage = CloudflareR2Storage;

// 使用示例：
// const r2Storage = new CloudflareR2Storage();
// r2Storage.testConnection().then(console.log);
// r2Storage.listFiles().then(console.log);