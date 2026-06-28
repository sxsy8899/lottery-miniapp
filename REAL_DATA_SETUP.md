# 接入真实彩票开奖数据 - 配置指南

## 当前实现方式

小程序已完成真实数据内置！**开箱即用，无需网络即可显示真实开奖结果**：

1. **首页加载**：展示已内置的真实历史开奖数据（来自 `utils/realData.js`）
2. **下拉刷新**：用户手动下拉，强制拉取最新一期数据
3. **降级策略**：网络错误/超时 → 自动使用已内置真实数据，不影响正常使用

---

## 方案A：配置微信小程序合法域名（推荐）

### 步骤

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入 **开发 → 开发管理 → 开发设置 → 服务器域名**
3. 在 **request 合法域名** 中添加：
   ```
   https://www.cwl.gov.cn
   https://www.lottery.gov.cn
   https://webapi.sporttery.cn
   ```
4. 保存并等待生效（约10分钟）
5. 重启微信开发者工具，重新编译

### 验证

下拉刷新首页，提示 "已更新真实数据" 即成功。

---

## 方案B：部署代理服务器（适合生产环境）

### 为什么需要代理？

- 官网有反爬保护（403 Forbidden）
- 需要用真实浏览器（Playwright）绕过反爬
- 微信小程序无法直接调用带反爬的 API

### 部署步骤

#### 1. 上传代理服务代码到 Oracle Cloud

```bash
# 在本地打包
cd lottery-miniapp/server
tar -czf proxy.tar.gz *

# 上传到 Oracle Cloud
scp proxy.tar.gz root@<你的服务器IP>:/opt/lottery-proxy/
```

#### 2. 在 Oracle Cloud 上启动服务

```bash
# SSH 登录服务器
ssh root@<你的服务器IP>

# 安装 Node.js（如未安装）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 解压并安装依赖
mkdir -p /opt/lottery-proxy
cd /opt/lottery-proxy
tar -xzf proxy.tar.gz
npm install

# 安装 Playwright 浏览器
npx playwright install chromium

# 启动服务（使用 PM2 守护进程）
npm install -g pm2
pm2 start index.js --name lottery-proxy
pm2 save
pm2 startup  # 开机自启
```

#### 3. 配置防火墙（开放端口 3000）

```bash
# Oracle Cloud 需要在控制台配置 Ingress Rules
# 路径：Oracle Cloud Console → Networking → Virtual Cloud Networks → Subnet → Security List
# 添加规则：Protocol = TCP, Source = 0.0.0.0/0, Destination Port = 3000
```

#### 4. 在小程序中使用代理服务

修改 `utils/lottery.js` 中的 `fetchRealData` 函数，将 URL 改为你的代理服务器地址：

```javascript
// 修改前
const CWL_API = {
  ssq:  'https://www.cwl.gov.cn/...',
  // ...
}

// 修改后
const PROXY_URL = 'https://your-domain.com:3000/api/lottery/'
function fetchRealData(lotteryCode, count = 5) {
  return new Promise((resolve) => {
    wx.request({
      url: PROXY_URL + lotteryCode + '?count=' + count,
      // ...
    })
  })
}
```

#### 5. 在微信后台配置代理服务器域名

将 `https://your-domain.com` 添加到 **request 合法域名**。

---

## 方案C：使用第三方彩票数据 API（最简单）

### 推荐 API

1. **网易彩票 API**（免费，但可能不稳定）
   ```
   https://caipiao.163.com/award/ssq/
   ```

2. **腾讯彩票 API**
   ```
   https://cp.sogou.com/
   ```

3. **自建爬虫 + 定时更新 JSON 文件**
   - 在服务器上定时爬取官网数据
   - 生成静态 JSON 文件
   - 小程序直接请求 JSON 文件（无需后端，无需配置复杂代理）

### 实现步骤（方案C）

#### 1. 在 Oracle Cloud 上创建定时爬虫脚本

```bash
# 创建爬虫脚本
cat > /opt/lottery-proxy/crawler.sh << 'EOF'
#!/bin/bash
# 使用 Playwright 爬取官网数据，保存为 JSON
node /opt/lottery-proxy/crawl_and_save.js
EOF

chmod +x /opt/lottery-proxy/crawler.sh
```

#### 2. 创建 `crawl_and_save.js`

```javascript
const { chromium } = require('playwright');
const fs = require('fs');

async function crawl() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  await page.goto('https://www.cwl.gov.cn/', { timeout: 30000 });
  await page.waitForTimeout(2000);
  
  const resp = await page.goto('https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=5');
  const text = await resp.text();
  const json = JSON.parse(text);
  
  fs.writeFileSync('/opt/lottery-proxy/public/ssq.json', JSON.stringify(json));
  console.log('✅ 数据已保存');
  
  await browser.close();
}

crawl().catch(console.error);
```

#### 3. 配置定时任务（每小时更新一次）

```bash
crontab -e
# 添加以下行
0 * * * * /opt/lottery-proxy/crawler.sh
```

#### 4. 在小程序中直接请求 JSON 文件

```javascript
wx.request({
  url: 'https://your-domain.com/ssq.json',
  success(res) {
    // 直接使用 res.data
  }
})
```

---

## 总结对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| A. 配置合法域名 | 简单，无需服务器 | 官网可能 403，数据获取不稳定 | ⭐⭐⭐ (测试用) |
| B. 部署代理服务器 | 稳定，可绕过反爬 | 需要服务器，配置复杂 | ⭐⭐⭐⭐⭐ (生产环境) |
| C. 定时爬虫 + 静态 JSON | 最简单，无需后端，速度快 | 数据有延迟（最长1小时） | ⭐⭐⭐⭐ (推荐) |

---

## 当前状态

✅ 小程序代码已支持真实数据接入  
✅ 已添加降级策略（失败则使用模拟数据）  
⚠️ 需要配置合法域名或部署代理服务器才能使用真实数据  

**建议**：先使用模拟数据测试小程序功能，确认无误后，再按照方案 C 部署定时爬虫，实现真实数据接入。
