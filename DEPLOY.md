# 彩票小程序 - 服务端部署指南

## 架构说明

```
小程序客户端                    服务端
┌─────────────┐              ┌──────────────────────┐
│  pages/     │              │  Express API Server  │
│  utils/api  │──HTTP请求──→ │  ├─ 内存缓存 (TTL)    │
│  utils/config│             │  ├─ lottery-data.json │
│  wx缓存     │←──JSON────── │  └─ Playwright (同步) │
└─────────────┘              └──────────────────────┘
```

## 1. 部署服务端

### 1.1 上传文件到服务器

```bash
# 将 server/ 目录上传到服务器
scp -r server/ user@your-server:/home/lottery-server/
```

### 1.2 安装依赖

```bash
cd /home/lottery-server
npm install
# 如果需要数据同步功能（从官网抓取最新数据），还需安装 Playwright 浏览器：
npx playwright install chromium
```

### 1.3 启动服务

```bash
# 开发模式
npm start

# 生产环境（建议用 PM2）
npm install -g pm2
pm2 start index.js --name lottery-api
pm2 save
pm2 startup
```

### 1.4 验证

```bash
curl http://localhost:3000/health
# 应返回 {"ok":true,"data":{...},"cacheKeys":0}
```

## 2. 配置 HTTPS（微信小程序要求）

微信小程序的 `wx.request` 要求 HTTPS 域名。用 Nginx 反向代理：

```nginx
server {
    listen 443 ssl;
    server_name lottery.yourdomain.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 3. 配置小程序

### 3.1 修改服务器地址

编辑 `utils/config.js`：

```js
module.exports = {
  API_BASE: 'https://lottery.yourdomain.com',  // 改成你的域名
  // ...
}
```

### 3.2 微信公众平台配置

1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 开发管理 → 开发设置 → 服务器域名
3. 在 `request合法域名` 中添加：`https://lottery.yourdomain.com`

## 4. 数据同步

### 4.1 手动同步

```bash
# 同步所有彩种
curl -X POST http://localhost:3000/api/lottery/sync \
  -H "Content-Type: application/json" \
  -d '{"codes":["ssq","fc3d","dlt","pl3","pl5","qxc","kl8","qlc"],"count":100}'

# 同步单个彩种
curl -X POST http://localhost:3000/api/lottery/sync \
  -H "Content-Type: application/json" \
  -d '{"codes":["ssq"],"count":50}'
```

### 4.2 自动同步（定时任务）

```bash
# 每天晚上 22:00 自动同步
crontab -e
# 添加：
0 22 * * * curl -X POST http://localhost:3000/api/lottery/sync -H "Content-Type: application/json" -d '{"count":100}'
```

## 5. API 端点一览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/lottery/all-latest` | GET | 所有彩种最新一期（首页用） |
| `/api/lottery/:code/latest` | GET | 单彩种最新一期 |
| `/api/lottery/:code/history?count=50` | GET | 历史数据（走势图用） |
| `/api/lottery/:code/missing?page=1&pageSize=25&pos=0` | GET | 遗漏查询（服务端计算） |
| `/api/lottery/:code/range` | GET | 数据范围信息 |
| `/api/lottery/sync` | POST | 从官网同步最新数据 |
| `/health` | GET | 健康检查 |

## 6. 客户端缓存策略

| 数据类型 | 服务端缓存 | 客户端缓存 |
|----------|-----------|-----------|
| 全部最新 | 6小时 | 6小时 |
| 单彩种最新 | 6小时 | 6小时 |
| 历史数据 | 12小时 | 12小时 |
| 遗漏数据 | 6小时 | 6小时 |

- 客户端优先使用本地缓存，过期后才请求服务端
- 服务端不可用时，客户端自动降级到本地缓存
- 首次打开无缓存时，显示加载状态，失败显示重试按钮
