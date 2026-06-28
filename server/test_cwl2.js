const { chromium } = require('playwright');

async function fetchCWL(lotteryCode, count) {
  const apiUrl = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=${count}`;
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      extraHTTPHeaders: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://www.cwl.gov.cn/',
      }
    });
    const page = await context.newPage();
    // 先访问首页拿Cookie
    console.log('[测试] 先访问官网首页...');
    await page.goto('https://www.cwl.gov.cn/', { timeout: 20000, waitUntil: 'domcontentloaded' }).catch(e => console.log('首页加载超时，继续...'));
    await page.waitForTimeout(2000);
    // 再访问API
    console.log('[测试] 访问API:', apiUrl);
    const resp = await page.goto(apiUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });
    console.log('[测试] HTTP status:', resp.status());
    const text = await resp.text();
    await context.close();
    await browser.close();
    console.log('[测试] 响应长度:', text.length);
    console.log('[测试] 前200字符:', text.substring(0, 200));
    const json = JSON.parse(text);
    if (json.state !== 0 || !json.result) {
      console.log('[测试] 数据格式错误, state=', json.state);
      return [];
    }
    console.log('[测试] 成功获取', json.result.length, '条数据');
    return json.result.slice(0, count);
  } catch (e) {
    console.error('[测试] 失败:', e.message);
    return [];
  }
}

(async () => {
  console.log('开始测试...');
  const data = await fetchCWL('ssq', 3);
  console.log('结果:', JSON.stringify(data, null, 2));
})();
