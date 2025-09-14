// 测试文件重新组织逻辑
// 模拟数据库数据和文件路径生成

// 模拟数据库数据（基于您提供的截图）
// 存储LP号后四位到履约单号的映射
const mockDatabaseData = new Map([
  ['7965', '1251020323274012'], // 00760744807965 的后四位
  ['3902', '1251020320703804'], // 00760711153902 的后四位
  ['6188', '1251020336897387'], // 00759873926188 的后四位
  ['8362', '1251020319493553'], // 00758559748362 的后四位
  ['6005', '1251020336730436'], // 00760959097605 的后四位
  ['5559', '1251020270331536'], // 00757572995559 的后四位
  ['8218', '1251020282609743']  // 00757882829218 的后四位
]);

// 修复后的路径生成函数
function generateNewPath(fileName, uploadTime, databaseData = null) {
  // 尝试从文件名提取日期和LP号后四位
  const dateLpMatch = fileName.match(/^(\d{8})_(\d{4})/);
  
  if (dateLpMatch) {
    const dateStr = dateLpMatch[1];
    const lpSuffix = dateLpMatch[2];
    
    // 将YYYYMMDD转换为YYYY-MM-DD格式
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const yearMonth = `${year}-${month}`;
    const yearMonthDay = `${year}-${month}-${day}`;
    
    // 查找对应的履约单号
    let contractNumber = lpSuffix; // 默认使用LP号后四位
    
    if (databaseData && databaseData.has(lpSuffix)) {
      contractNumber = databaseData.get(lpSuffix); // 使用找到的履约单号
      console.log(`🔍 找到匹配: LP号后四位 ${lpSuffix} -> 履约单号 ${contractNumber}`);
    } else {
      console.log(`⚠️ 未找到匹配: LP号后四位 ${lpSuffix}，使用默认值`);
    }
    
    return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${contractNumber}/${fileName}`;
  }
  
  // 如果没有匹配到，使用上传时间推断日期
  const uploadDate = new Date(uploadTime);
  const year = uploadDate.getFullYear();
  const month = String(uploadDate.getMonth() + 1).padStart(2, '0');
  const day = String(uploadDate.getDate()).padStart(2, '0');
  const yearMonth = `${year}-${month}`;
  const yearMonthDay = `${year}-${month}-${day}`;
  
  // 生成一个基于文件名的默认履约单号
  const defaultContract = `DEFAULT_${fileName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}`;
  
  return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${defaultContract}/${fileName}`;
}

// 测试用例
const testFiles = [
  '20250901_0441/1756735814490_0_ny0u_IMG_4002.jpeg', // 0441 在数据库中不存在 -> 使用LP号后四位
  '20250901_7965/1756735819119_1_6ytw_IMG_4003.jpeg', // 7965 在数据库中存在 -> 使用履约单号
  '20250901_3902/1756735828614_4_d8j5_IMG_4006.jpeg', // 3902 在数据库中存在 -> 使用履约单号
  '20250901_1234/1756735830000_5_test_IMG_4007.jpeg', // 1234 在数据库中不存在 -> 使用LP号后四位
  '20250901_6188/1756735840000_6_test_IMG_4008.jpeg'  // 6188 在数据库中存在 -> 使用履约单号
];

console.log('🧪 测试文件重新组织逻辑\n');

testFiles.forEach(fileName => {
  const newPath = generateNewPath(fileName, new Date().toISOString(), mockDatabaseData);
  console.log(`📁 原文件: ${fileName}`);
  console.log(`📁 新路径: ${newPath}`);
  console.log('---');
});

console.log('\n📊 数据库匹配情况:');
console.log('LP号后四位 0441 -> 在数据库中查找...');
if (mockDatabaseData.has('0441')) {
  console.log(`✅ 找到匹配: 0441 -> ${mockDatabaseData.get('0441')}`);
} else {
  console.log('❌ 未找到匹配，将使用LP号后四位 0441（用户将手动处理）');
}

console.log('\nLP号后四位 7965 -> 在数据库中查找...');
if (mockDatabaseData.has('7965')) {
  console.log(`✅ 找到匹配: 7965 -> ${mockDatabaseData.get('7965')}`);
} else {
  console.log('❌ 未找到匹配，将使用LP号后四位 7965');
}

console.log('\nLP号后四位 3902 -> 在数据库中查找...');
if (mockDatabaseData.has('3902')) {
  console.log(`✅ 找到匹配: 3902 -> ${mockDatabaseData.get('3902')}`);
} else {
  console.log('❌ 未找到匹配，将使用LP号后四位 3902');
}
