// R2批量上传脚本
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 配置
const CONFIG = {
    bucketName: 'cb-file-storage',
    sourceDirectory: './file-storage', // 当前视频文件目录
    excludePatterns: [
        'index.html',
        'database.json',
        'files-registry.json',
        '*.js',
        '*.css'
    ]
};

// 获取所有视频文件夹
function getVideoFolders(directory) {
    const folders = [];
    const items = fs.readdirSync(directory);
    
    for (const item of items) {
        const fullPath = path.join(directory, item);
        const stat = fs.statSync(fullPath);
        
        // 检查是否为日期格式的文件夹 (20250XXX_*)
        if (stat.isDirectory() && item.match(/^20\d{6}_/)) {
            folders.push({
                name: item,
                path: fullPath
            });
        }
    }
    
    return folders;
}

// 上传单个文件夹
async function uploadFolder(folder) {
    console.log(`📤 开始上传文件夹: ${folder.name}`);
    
    return new Promise((resolve, reject) => {
        const command = `wrangler r2 object put ${CONFIG.bucketName}/videos/${folder.name} --file=${folder.path} --recursive`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ 上传失败 ${folder.name}:`, error);
                reject(error);
            } else {
                console.log(`✅ 上传成功: ${folder.name}`);
                console.log(stdout);
                resolve(stdout);
            }
        });
    });
}

// 主函数
async function main() {
    console.log('🚀 开始批量上传到Cloudflare R2...');
    
    try {
        const folders = getVideoFolders(CONFIG.sourceDirectory);
        console.log(`📁 发现 ${folders.length} 个视频文件夹`);
        
        let successCount = 0;
        let failedCount = 0;
        
        for (const folder of folders) {
            try {
                await uploadFolder(folder);
                successCount++;
            } catch (error) {
                failedCount++;
                console.error(`Failed to upload ${folder.name}`);
            }
            
            // 添加延迟避免API限制
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('\n📊 上传统计:');
        console.log(`✅ 成功: ${successCount} 个文件夹`);
        console.log(`❌ 失败: ${failedCount} 个文件夹`);
        
    } catch (error) {
        console.error('❌ 批量上传失败:', error);
    }
}

// 运行脚本
if (require.main === module) {
    main();
}

module.exports = { getVideoFolders, uploadFolder };
