const { chromium } = require('playwright');

const CWL_API_MAP = {
  ssq:  { name: 'ssq',  label: '双色球' },
  fc3d: { name: 'fc3d', label: '福彩3D' },
  qlc:  { name: 'qlc',  label: '七乐彩' },
  kl8:  { name: 'kl8',  label: '快乐8' },
};

async function fetchCWL(lotteryCode, count) {
  const apiConf = CWL_API_MAP[lotteryCode];
  if (!apiConf) return [];
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=${apiConf.name}&issueCount=${count}`;
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Referer': 'https://www.cwl.gov.cn/',
        'Accept': 'application/json, text/plain, */*',
      }
    });
    const page = await context.newPage();
    console.log('[fetchCWL] 正在访问:', url);
    const resp = await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
    console.log('[fetchCWL] HTTP status:', resp.status());
    const text = await resp.text();
    console.log('[fetchCWL] 响应长度:', text.length);
    console.log('[fetchCWL] 前200字符:', text.substring(0, 200));
    await context.close();
    await browser.close();
    const json = JSON.parse(text);
    if (json.state !== 0 || !json.result) {
      console.log('[fetchCWL] 数据格式错误, state=', json.state);
      return [];
    }
    const results = [];
    for (const item of json.result.slice(0, count)) {
      const entry = {
        period: item.code,
        date:   item.date || '',
        sales:  item.sales || '0',
        pool:   item.poolmoney || '0',
      };
      if (lotteryCode === 'ssq') {
        entry.reds = (item.red  || '').split(',').map(Number);
        entry.blue = Number(item.blue);
      } else if (lotteryCode === 'fc3d') {
        entry.numbers = (item.red || '').split(',').map(Number);
      } else if (lotteryCode === 'qlc') {
        entry.reds = (item.red  || '').split(',').map(Number);
        entry.blue = Number(item.blue);
      } else if (lotteryCode === 'kl8') {
        entry.numbers = (item.red || '').split(',').map(Number);
      }
      results.push(entry);
    }
    console.log('[fetchCWL] 成功解析', results.length, '条数据');
    return results;
  } catch (e) {
    console.error('[fetchCWL] 抓取失败:', e.message);
    console.error('[fetchCWL] 错误堆栈:', e.stack);
    return [];
  }
}

// 测试
(async () => {
  console.log('开始测试 fetchCWL(ssq, 3)...');
  const data = await fetchCWL('ssq', 3);
  console.log('结果:', JSON.stringify(data, null, 2));
})();
