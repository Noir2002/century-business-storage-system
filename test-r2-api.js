const fetch = require('node-fetch');

// 配置
const config = {
  token: 'NzAWLCtCOBzntfrRZjwVlw6rrDtG3_GJQKFw0luO',
  accountId: '23441d4f7734b84186c4c20ddefef8e7',
  bucketName: 'century-business-system'
};

async function testR2API() {
  console.log('🧪 测试R2 API连接...');
  
  try {
    // 测试1: 列出存储桶中的所有对象
    console.log('\n📋 测试1: 列出所有对象');
    const url1 = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucketName}/objects`;
    
    const response1 = await fetch(url1, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`状态码: ${response1.status}`);
    
    if (response1.ok) {
      const data1 = await response1.json();
      console.log('API响应结构:', JSON.stringify(data1, null, 2));
      
      if (data1.result && data1.result.objects) {
        console.log(`找到 ${data1.result.objects.length} 个对象`);
        
        // 显示前5个对象
        data1.result.objects.slice(0, 5).forEach((obj, index) => {
          console.log(`  ${index + 1}. ${obj.key}`);
        });
        
        if (data1.result.objects.length > 5) {
          console.log(`  ... 还有 ${data1.result.objects.length - 5} 个对象`);
        }
      } else {
        console.log('❌ 响应中没有找到objects数组');
      }
    } else {
      const error1 = await response1.text();
      console.error(`❌ 错误: ${error1}`);
    }
    
    // 测试2: 列出特定前缀的对象
    console.log('\n📋 测试2: 列出package/前缀的对象');
    const url2 = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucketName}/objects?prefix=package/`;
    
    const response2 = await fetch(url2, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`状态码: ${response2.status}`);
    
    if (response2.ok) {
      const data2 = await response2.json();
      console.log(`找到 ${data2.result.objects.length} 个package/对象`);
      
      // 显示前5个对象
      data2.result.objects.slice(0, 5).forEach((obj, index) => {
        console.log(`  ${index + 1}. ${obj.key}`);
      });
    } else {
      const error2 = await response2.text();
      console.error(`❌ 错误: ${error2}`);
    }
    
    // 测试3: 列出2025-09-14前缀的对象
    console.log('\n📋 测试3: 列出2025-09-14前缀的对象');
    const url3 = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucketName}/objects?prefix=package/2025-09/2025-09-14/`;
    
    const response3 = await fetch(url3, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`状态码: ${response3.status}`);
    
    if (response3.ok) {
      const data3 = await response3.json();
      console.log(`找到 ${data3.result.objects.length} 个2025-09-14对象`);
      
      // 显示所有对象
      data3.result.objects.forEach((obj, index) => {
        console.log(`  ${index + 1}. ${obj.key}`);
      });
    } else {
      const error3 = await response3.text();
      console.error(`❌ 错误: ${error3}`);
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

testR2API();
