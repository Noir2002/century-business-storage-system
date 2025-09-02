// Cloudflare R2 存储管理
class CloudflareStorage {
    constructor(config) {
        this.config = config;
        this.uploadProgress = new Map();
    }

    // 上传文件到R2
    async uploadFile(file, folderPath, fileName, fileType = 'videos') {
        const startTime = Date.now();
        
        try {
            // 文件验证
            if (!this.validateFile(file)) {
                throw new Error('文件格式或大小不符合要求');
            }

            // 构建文件路径
            const filePath = `${this.config.files.buckets[fileType]}/${folderPath}/${fileName}`;
            
            // 使用浏览器原生fetch上传（简化版本）
            const uploadUrl = await this.getUploadUrl(filePath);
            
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type || 'application/octet-stream'
                }
            });

            if (!response.ok) {
                throw new Error(`上传失败: ${response.status} ${response.statusText}`);
            }

            const uploadTime = Date.now() - startTime;
            const fileUrl = `${this.config.domains.files}/${filePath}`;

            return {
                success: true,
                url: fileUrl,
                downloadUrl: fileUrl,
                fileName: fileName,
                originalName: file.name,
                size: file.size,
                type: file.type,
                path: filePath,
                uploadTime: new Date().toISOString(),
                uploadDuration: uploadTime
            };

        } catch (error) {
            console.error('上传失败:', error);
            return {
                success: false,
                error: error.message,
                fileName: fileName,
                originalName: file.name
            };
        }
    }

    // 获取上传URL（简化版本，实际应用中需要服务器端签名）
    async getUploadUrl(filePath) {
        // 这里应该调用你的服务器端API来获取预签名URL
        // 为了演示，我们直接返回一个构造的URL
        return `${this.config.r2.endpoint}/${this.config.r2.bucketName}/${filePath}`;
    }

    // 文件验证
    validateFile(file) {
        // 检查文件大小
        if (file.size > this.config.files.maxSize) {
            return false;
        }

        // 检查文件类型
        const allowedTypes = this.config.files.allowedTypes;
        return allowedTypes.some(type => {
            if (type.endsWith('/*')) {
                return file.type.startsWith(type.slice(0, -1));
            }
            return file.type === type;
        });
    }

    // 批量上传
    async uploadMultipleFiles(files, folderPath, fileType = 'videos') {
        const results = [];
        let successCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // 生成唯一文件名
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).slice(2, 6);
            const fileName = `${timestamp}_${i}_${randomSuffix}_${file.name}`;

            const result = await this.uploadFile(file, folderPath, fileName, fileType);
            results.push(result);

            if (result.success) {
                successCount++;
            }

            // 更新进度
            this.updateProgress('upload', {
                current: i + 1,
                total: files.length,
                success: successCount,
                currentFile: file.name
            });
        }

        return {
            success: successCount > 0,
            total: files.length,
            successCount: successCount,
            failedCount: files.length - successCount,
            results: results
        };
    }

    // 删除过期文件
    async cleanupExpiredFiles() {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() - this.config.files.retentionDays);

        try {
            // 这里需要调用服务器端API来删除过期文件
            // 因为浏览器无法直接列出R2中的文件
            const response = await fetch('/api/cleanup-expired', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    expiryDate: expiryDate.toISOString()
                })
            });

            if (response.ok) {
                const result = await response.json();
                return result;
            } else {
                throw new Error('清理失败');
            }
        } catch (error) {
            console.error('自动清理失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 更新进度
    updateProgress(operation, progress) {
        this.uploadProgress.set(operation, progress);
        
        // 触发进度更新事件
        const event = new CustomEvent('cloudflare-storage-progress', {
            detail: { operation, progress }
        });
        window.dispatchEvent(event);
    }

    // 获取文件URL
    getFileUrl(filePath) {
        return `${this.config.domains.files}/${filePath}`;
    }
}

// 初始化存储实例
const cloudflareStorage = new CloudflareStorage(CLOUDFLARE_CONFIG);
