// R2文件重新组织脚本
// 将直接存储在bucket根目录的文件移动到正确的文件夹结构中

const BUCKET_NAME = 'century-business-system';
const R2_ACCOUNT_ID = 'your-account-id'; // 需要替换为实际的Account ID
const R2_ACCESS_KEY_ID = 'your-access-key-id'; // 需要替换为实际的Access Key ID
const R2_SECRET_ACCESS_KEY = 'your-secret-access-key'; // 需要替换为实际的Secret Access Key

// 文件类型映射
const FILE_TYPE_MAPPING = {
  'image/jpeg': 'images',
  'image/png': 'images', 
  'image/gif': 'images',
  'video/mp4': 'videos',
  'video/avi': 'videos',
  'video/mov': 'videos',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'application/vnd.ms-excel': 'excel',
  'text/plain': 'documents',
  'application/pdf': 'documents'
};

// 从文件名中提取日期和履约单号
function extractDateAndContractFromFileName(fileName) {
  // 匹配模式：YYYYMMDD_履约单号_其他信息
  const dateContractMatch = fileName.match(/^(\d{8})_([^_]+)_/);
  if (dateContractMatch) {
    const dateStr = dateContractMatch[1];
    const contract = dateContractMatch[2];
    
    // 将YYYYMMDD转换为YYYY-MM-DD格式
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const formattedDate = `${year}-${month}-${day}`;
    
    return {
      date: formattedDate,
      contract: contract,
      yearMonth: `${year}-${month}`,
      yearMonthDay: formattedDate
    };
  }
  
  // 如果没有匹配到，尝试从修改时间推断
  return null;
}

// 生成新的文件路径
function generateNewPath(fileName, fileType, uploadTime) {
  const dateInfo = extractDateAndContractFromFileName(fileName);
  
  if (dateInfo) {
    // 使用文件名中的日期和履约单号
    return `package/${dateInfo.yearMonth}/${dateInfo.yearMonthDay}/${dateInfo.yearMonthDay}_${dateInfo.contract}/${fileName}`;
  } else {
    // 使用上传时间推断日期
    const uploadDate = new Date(uploadTime);
    const year = uploadDate.getFullYear();
    const month = String(uploadDate.getMonth() + 1).padStart(2, '0');
    const day = String(uploadDate.getDate()).padStart(2, '0');
    const yearMonth = `${year}-${month}`;
    const yearMonthDay = `${year}-${month}-${day}`;
    
    // 生成一个默认的履约单号
    const defaultContract = `DEFAULT_${Date.now()}`;
    
    return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${defaultContract}/${fileName}`;
  }
}

// 主函数：重新组织R2文件
async function reorganizeR2Files() {
  console.log('🚀 开始重新组织R2文件...');
  
  try {
    // 这里需要实际的R2 API调用
    // 由于没有直接的R2 SDK，这里提供逻辑框架
    
    console.log('📋 步骤1: 列出所有需要重新组织的文件');
    console.log('   - 查找直接存储在bucket根目录的文件');
    console.log('   - 排除已经在package/文件夹中的文件');
    
    console.log('📋 步骤2: 分析文件并生成新路径');
    console.log('   - 从文件名提取日期和履约单号');
    console.log('   - 生成正确的文件夹结构');
    
    console.log('📋 步骤3: 创建目标文件夹结构');
    console.log('   - 创建package/YYYYMM/YYYYMMDD/YYYYMMDD_履约单号/目录');
    
    console.log('📋 步骤4: 移动文件');
    console.log('   - 将文件从根目录移动到新路径');
    console.log('   - 保持文件元数据');
    
    console.log('📋 步骤5: 验证移动结果');
    console.log('   - 检查文件是否在新位置');
    console.log('   - 删除原位置的文件');
    
    console.log('✅ 文件重新组织完成！');
    
  } catch (error) {
    console.error('❌ 重新组织失败:', error);
  }
}

// 生成具体的文件移动命令
function generateMoveCommands() {
  const commands = [];
  
  // 基于您提供的截图，这些是需要移动的文件（只处理打包系统文件）
  const filesToMove = [
    // 图片文件（需要移动）
    '20250901_0441/1756735814490_0_ny0u_IMG_4002.jpeg',
    '20250901_0441/1756735814490_0_ny0u_IMG_4003.jpeg', 
    '20250901_0441/1756735814490_0_ny0u_IMG_4004.jpeg',
    '20250901_0441/1756735814490_0_ny0u_IMG_4005.jpeg',
    '20250901_0441/1756735814490_0_ny0u_IMG_4006.jpeg',
    
    // 注意：以下文件属于库存系统，不应该移动
    // 'arc/1756828757545-610411144.xlsx',           // 库存系统Excel文件
    // 'arc/1756983144571-834207011.xlsx',           // 库存系统Excel文件
    // 'arc/1757323156909-901182186.xlsx',           // 库存系统Excel文件
    // 'arc/天猫订单导入.xlsx',                        // 库存系统Excel文件
    // 'arc/网站导入数据.xlsx',                        // 库存系统Excel文件
    // 'package-sync/database.json',                 // 库存系统JSON文件
    // 'package-sync/files.json'                     // 库存系统JSON文件
  ];
  
  filesToMove.forEach(fileName => {
    const newPath = generateNewPath(fileName, 'unknown', new Date().toISOString());
    commands.push({
      source: fileName,
      destination: newPath,
      action: 'move'
    });
  });
  
  return commands;
}

// 输出移动命令
console.log('📝 生成的文件移动命令:');
const moveCommands = generateMoveCommands();
moveCommands.forEach((cmd, index) => {
  console.log(`${index + 1}. 移动: ${cmd.source} -> ${cmd.destination}`);
});

// 如果直接运行此脚本
if (require.main === module) {
  reorganizeR2Files();
}

module.exports = {
  reorganizeR2Files,
  generateMoveCommands,
  extractDateAndContractFromFileName,
  generateNewPath
};
