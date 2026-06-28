const { chromium } = require('playwright');

async function fetchCWLDirect(lotteryCode, count) {
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });
    
    const page = await context.newPage();
    
    // 先访问官网首页，获取完整Cookies
    console.log('[测试] 第1步：访问官网首页...');
    await page.goto('https://www.cwl.gov.cn/', { 
      timeout: 30000, 
      waitUntil: 'networkidle' 
    }).catch(e => console.log('首页加载超时，继续...'));
    
    await page.waitForTimeout(3000);
    
    // 查看当前URL和Cookies
    const cookies = await context.cookies();
    console.log('[测试] 获取到', cookies.length, '个Cookies');
    console.log('[测试] 当前URL:', page.url());
    
    // 再访问API
    console.log('[测试] 第2步：访问API...');
    const apiUrl = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=${count}`;
    const resp = await page.goto(apiUrl, { 
      timeout: 20000, 
      waitUntil: 'domcontentloaded' 
    });
    
    console.log('[测试] HTTP status:', resp.status());
    const text = await resp.text();
    console.log('[测试] 响应长度:', text.length);
    console.log('[测试] 前300字符:', text.substring(0, 300));
    
    await context.close();
    await browser.close();
    
    // 尝试解析JSON
    try {
      const json = JSON.parse(text);
      console.log('[测试] JSON解析成功！state:', json.state);
      console.log('[测试] 数据条数:', json.data?.length || json.result?.length || 0);
      return json;
    } catch(e) {
      console.log('[测试] JSON解析失败:', e.message);
      return null;
    }
  } catch(e) {
    console.error('[测试] 错误:', e.message);
    return null;
  }
}

(async () => {
  console.log('开始测试...');
  const result = await fetchCWLDirect('ssq', 3);
  if (result) {
    console.log('✅ 成功获取真实数据！');
    console.log('数据:', JSON.stringify(result, null, 2).substring(0, 500));
  } else {
    console.log('❌ 获取失败');
  }
})();
