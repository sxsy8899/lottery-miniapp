const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const https = require('https')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '50mb' }))

// ============ 数据加载 ============

const DATA_FILE = path.join(__dirname, 'data', 'lottery-data.json')

let LOTTERY_DATA = {}

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8')
    LOTTERY_DATA = JSON.parse(raw)
    const codes = Object.keys(LOTTERY_DATA)
    console.log('数据加载完成，彩种:', codes.map(c => `${c}(${LOTTERY_DATA[c].length}期)`).join(', '))
  } catch (e) {
    console.error('数据文件加载失败:', e.message)
    console.error('请确保 data/lottery-data.json 存在')
    LOTTERY_DATA = {}
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(LOTTERY_DATA))
    console.log('数据已持久化到文件')
  } catch (e) {
    console.error('数据持久化失败:', e.message)
  }
}

loadData()

// ============ 内存缓存 ============

const cache = new Map()
const CACHE_TTL = {
  latest: 6 * 60 * 60 * 1000,
  history: 12 * 60 * 60 * 1000,
  missing: 6 * 60 * 60 * 1000,
  allLatest: 6 * 60 * 60 * 1000,
}

function getCache(key) {
  const item = cache.get(key)
  if (!item) return null
  if (Date.now() - item.time > item.ttl) {
    cache.delete(key)
    return null
  }
  return item.data
}

function setCache(key, data, ttl) {
  cache.set(key, { data, time: Date.now(), ttl })
}

function clearCacheForCode(code) {
  for (const key of cache.keys()) {
    if (key.includes(code) || key === 'allLatest') cache.delete(key)
  }
}

// ============ HTTP 请求工具 ============

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...headers,
      },
      timeout: 15000,
    }
    const req = https.get(url, options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data, headers: res.headers })
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
  })
}

// ============ 数据源配置 ============

const CWL_API_MAP = {
  ssq: 'ssq', fc3d: '3d', qlc: 'qlc', kl8: 'kl8',
}
const TC_GAMENO_MAP = {
  dlt: '85', pl3: '35', qxc: '04',
}

// ============ 数据抓取 ============

async function fetchCWL(code, count) {
  const name = CWL_API_MAP[code]
  if (!name) return []
  const apiUrl = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=${name}&issueCount=${count}`
  try {
    // 先访问首页获取 Cookie
    await httpsGet('https://www.cwl.gov.cn/', {
      'Referer': 'https://www.cwl.gov.cn/',
    }).catch(() => {})

    const resp = await httpsGet(apiUrl, {
      'Referer': 'https://www.cwl.gov.cn/ygkj/wqkjgg/',
    })
    if (resp.statusCode !== 200) {
      console.error(`[CWL:${code}] HTTP ${resp.statusCode}`)
      return []
    }
    const json = JSON.parse(resp.body)
    if (!json.result || !Array.isArray(json.result)) return []

    const results = []
    for (const item of json.result.slice(0, count)) {
      const entry = {
        period: item.code,
        date: (item.date || '').replace(/\(.*$/, '').trim(),
      }
      if (code === 'ssq') {
        entry.reds = (item.red || '').split(',').map(Number).filter(n => !isNaN(n))
        entry.blue = Number(item.blue)
      } else if (code === 'qlc') {
        // QLC: 7 个基本号 + 1 个特别号
        entry.numbers = (item.red || '').split(',').map(Number).filter(n => !isNaN(n))
        entry.special = Number(item.blue)
      } else if (code === 'fc3d') {
        entry.numbers = (item.red || '').split(',').map(Number).filter(n => !isNaN(n))
      } else if (code === 'kl8') {
        entry.numbers = (item.red || '').split(',').map(Number).filter(n => !isNaN(n))
      }
      results.push(entry)
    }
    console.log(`[CWL:${code}] 获取 ${results.length} 期`)
    return results
  } catch (e) {
    console.error(`[CWL:${code}]`, e.message)
    return []
  }
}

async function fetchTC(code, count) {
  const gameNo = TC_GAMENO_MAP[code]
  if (!gameNo) return []
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=${gameNo}&provinceId=0&pageSize=${count}&isVerify=1&pageNo=1`
  try {
    const resp = await httpsGet(url, {
      'Referer': 'https://www.lottery.gov.cn/',
    })
    if (resp.statusCode !== 200) {
      console.error(`[TC:${code}] HTTP ${resp.statusCode}`)
      return code === 'pl3' ? { pl3: [], pl5: [] } : []
    }
    const json = JSON.parse(resp.body)
    const drawList = json?.value?.list || json?.value?.pageList || []
    if (!drawList.length) return code === 'pl3' ? { pl3: [], pl5: [] } : []

    const results = []
    const pl5Results = []
    for (const item of drawList.slice(0, count)) {
      const entry = {
        period: item.lotteryDrawNum,
        date: (item.lotteryDrawTime || '').split(' ')[0],
      }
      const result = (item.lotteryDrawResult || '').trim()
      if (code === 'dlt') {
        const parts = result.split(/[,，\s]+/).filter(s => s)
        entry.front = parts.slice(0, 5).map(Number).filter(n => !isNaN(n))
        entry.back = parts.slice(5, 7).map(Number).filter(n => !isNaN(n))
      } else if (code === 'pl3') {
        // pl3: lotteryDrawResult 为 3 位
        entry.numbers = result.split(/[,，\s]+/).map(Number).filter(n => !isNaN(n))
        // pl5: lotteryUnsortDrawresult 为 5 位
        const unsorted = (item.lotteryUnsortDrawresult || '').trim()
        pl5Results.push({
          period: entry.period,
          date: entry.date,
          numbers: unsorted.split(/[,，\s]+/).map(Number).filter(n => !isNaN(n)),
        })
      } else {
        entry.numbers = result.split(/[,，\s]+/).map(Number).filter(n => !isNaN(n))
      }
      results.push(entry)
    }
    if (code === 'pl3') {
      console.log(`[TC:pl3] 获取 ${results.length} 期, [TC:pl5] 获取 ${pl5Results.length} 期`)
      return { pl3: results, pl5: pl5Results }
    }
    console.log(`[TC:${code}] 获取 ${results.length} 期`)
    return results
  } catch (e) {
    console.error(`[TC:${code}]`, e.message)
    return code === 'pl3' ? { pl3: [], pl5: [] } : []
  }
}

// ============ 数据同步 ============

async function syncData(codes, count = 100) {
  if (!codes || !codes.length) {
    codes = Object.keys(LOTTERY_DATA)
  }
  const updated = []
  let hasChanges = false

  for (const code of codes) {
    let newData = []
    let pl5Data = null
    if (CWL_API_MAP[code]) {
      newData = await fetchCWL(code, count)
    } else if (TC_GAMENO_MAP[code]) {
      const tcResult = await fetchTC(code, count)
      if (code === 'pl3' && tcResult && tcResult.pl3) {
        newData = tcResult.pl3
        pl5Data = tcResult.pl5
      } else {
        newData = tcResult
      }
    }

    // 处理 pl5 数据（来自 pl3 的同一次 API 调用）
    if (pl5Data && pl5Data.length > 0) {
      const existingPl5 = LOTTERY_DATA['pl5'] || []
      const existingPl5Periods = new Set(existingPl5.map(d => d.period))
      const newPl5 = pl5Data.filter(d => !existingPl5Periods.has(d.period))
      if (newPl5.length > 0) {
        LOTTERY_DATA['pl5'] = [...newPl5, ...existingPl5]
        clearCacheForCode('pl5')
        updated.push({ code: 'pl5', added: newPl5.length, total: LOTTERY_DATA['pl5'].length })
        hasChanges = true
        console.log(`[pl5] 新增 ${newPl5.length} 期，总计 ${LOTTERY_DATA['pl5'].length} 期`)
      }
    }

    if (newData.length > 0) {
      const existing = LOTTERY_DATA[code] || []
      const existingPeriods = new Set(existing.map(d => d.period))
      const newOnes = newData.filter(d => !existingPeriods.has(d.period))

      if (newOnes.length > 0) {
        // 合并：新数据在前，旧数据在后
        LOTTERY_DATA[code] = [...newData.filter(d => !existingPeriods.has(d.period)), ...existing]
        clearCacheForCode(code)
        updated.push({ code, added: newOnes.length, total: LOTTERY_DATA[code].length })
        hasChanges = true
        console.log(`[${code}] 新增 ${newOnes.length} 期，总计 ${LOTTERY_DATA[code].length} 期`)
      } else {
        updated.push({ code, added: 0, total: existing.length })
      }
    } else {
      updated.push({ code, added: 0, total: (LOTTERY_DATA[code] || []).length, error: '获取失败' })
    }
  }

  if (hasChanges) {
    saveData()
  }

  return updated
}

// ============ 工具函数 ============

function range(start, end) {
  const arr = []
  for (let i = start; i <= end; i++) arr.push(i)
  return arr
}

// ============ 遗漏计算（服务端）============

const MISSING_CONFIGS = {
  ssq:  { label: '红球', values: range(1, 33),      getNums: d => d.reds || [] },
  fc3d: { label: '号码', values: range(0, 9),        getNums: d => [d.numbers && d.numbers[0]] },
  pl3:  { label: '号码', values: range(0, 9),        getNums: d => [d.numbers && d.numbers[0]] },
  pl5:  { label: '号码', values: range(0, 9),        getNums: d => [d.numbers && d.numbers[0]] },
  qxc:  { label: '号码', values: range(0, 9),        getNums: d => [d.numbers && d.numbers[0]] },
  kl8:  { label: '号码', values: range(1, 80),       getNums: d => d.numbers || [] },
  qlc:  { label: '基本号', values: range(1, 30),     getNums: d => d.numbers || [] },
  dlt:  { label: '前区', values: range(1, 35),       getNums: d => d.front || [] },
}

const MISSING_TITLES = {
  ssq: '双色球红球1-33遗漏',
  fc3d: '福彩3D百位0-9遗漏',
  kl8: '快乐8号码1-80遗漏',
  qlc: '七乐彩基本号1-30遗漏',
  dlt: '大乐透前区1-35遗漏',
  pl3: '排列三百位0-9遗漏',
  pl5: '排列五万位0-9遗漏',
  qxc: '七星彩第1位0-9遗漏',
}

function calculateMissing(lotteryCode, page, pageSize, pos) {
  const draws = LOTTERY_DATA[lotteryCode] || []
  const count = draws.length
  const cfg = MISSING_CONFIGS[lotteryCode]
  if (!cfg) return { list: [], total: 0, page: 1, totalPages: 0, pageSize, title: '' }

  const getNums = (['fc3d', 'pl3', 'pl5', 'qxc'].includes(lotteryCode) && pos !== undefined)
    ? d => [d.numbers && d.numbers[pos]]
    : cfg.getNums

  const allValues = cfg.values
  const totalNumbers = allValues.length
  const totalPages = Math.ceil(totalNumbers / pageSize)
  const startIdx = (page - 1) * pageSize
  const endIdx = Math.min(startIdx + pageSize, totalNumbers)

  const results = []

  for (let i = startIdx; i < endIdx; i++) {
    const val = allValues[i]
    let occCount = 0
    let currentMissing = count
    let lastSeenIdx = -1
    let maxMissing = 0

    for (let di = 0; di < count; di++) {
      const nums = getNums(draws[di])
      if (nums.includes(val)) {
        occCount++
        if (lastSeenIdx === -1) {
          currentMissing = di
          lastSeenIdx = di
        } else {
          const gap = di - lastSeenIdx - 1
          if (gap > maxMissing) maxMissing = gap
          lastSeenIdx = di
        }
      }
    }
    if (lastSeenIdx >= 0) {
      const finalGap = count - lastSeenIdx - 1
      if (finalGap > maxMissing) maxMissing = finalGap
    } else {
      currentMissing = count
      maxMissing = count
    }

    const numStr = String(val).padStart(2, '0')
    results.push({
      index: i + 1,
      number: numStr,
      digits: numStr.split(''),
      count: occCount,
      currentMissing,
      maxMissing,
    })
  }

  return {
    list: results,
    total: totalNumbers,
    page, totalPages, pageSize,
    title: (MISSING_TITLES[lotteryCode] || '') + `（基于${count}期数据）`,
  }
}

// ============ API 路由 ============

app.get('/api/lottery/all-latest', (req, res) => {
  const cacheKey = 'allLatest'
  const cached = getCache(cacheKey)
  if (cached) return res.json({ success: true, source: 'cache', data: cached })

  const result = {}
  for (const [code, arr] of Object.entries(LOTTERY_DATA)) {
    if (arr && arr.length > 0) result[code] = arr[0]
  }
  setCache(cacheKey, result, CACHE_TTL.allLatest)
  res.json({ success: true, source: 'local', data: result })
})

app.get('/api/lottery/:code/latest', (req, res) => {
  const code = req.params.code
  const cacheKey = `latest_${code}`
  const cached = getCache(cacheKey)
  if (cached) return res.json({ success: true, source: 'cache', data: cached })

  const arr = LOTTERY_DATA[code]
  if (!arr || arr.length === 0) {
    return res.json({ success: false, data: null, error: '无数据' })
  }
  const data = arr[0]
  setCache(cacheKey, data, CACHE_TTL.latest)
  res.json({ success: true, source: 'local', data })
})

app.get('/api/lottery/:code/history', (req, res) => {
  const code = req.params.code
  const count = Math.min(parseInt(req.query.count) || 50, 2000)
  const cacheKey = `history_${code}_${count}`
  const cached = getCache(cacheKey)
  if (cached) return res.json({ success: true, source: 'cache', data: cached, total: cached.length })

  const arr = LOTTERY_DATA[code]
  if (!arr || arr.length === 0) {
    return res.json({ success: false, data: [], total: 0, error: '无数据' })
  }
  const data = arr.slice(0, count)
  setCache(cacheKey, data, CACHE_TTL.history)
  res.json({ success: true, source: 'local', data, total: arr.length })
})

app.get('/api/lottery/:code/missing', (req, res) => {
  const code = req.params.code
  const page = parseInt(req.query.page) || 1
  const pageSize = parseInt(req.query.pageSize) || 25
  const pos = parseInt(req.query.pos) || 0
  const cacheKey = `missing_${code}_${page}_${pageSize}_${pos}`
  const cached = getCache(cacheKey)
  if (cached) return res.json({ success: true, source: 'cache', data: cached })

  const result = calculateMissing(code, page, pageSize, pos)
  setCache(cacheKey, result, CACHE_TTL.missing)
  res.json({ success: true, source: 'local', data: result })
})

app.get('/api/lottery/:code/range', (req, res) => {
  const code = req.params.code
  const arr = LOTTERY_DATA[code]
  if (!arr || arr.length === 0) {
    return res.json({ success: false, data: null })
  }
  res.json({
    success: true,
    data: { total: arr.length, first: arr[arr.length - 1].date, last: arr[0].date }
  })
})

// 手动触发同步（服务器端抓取，可能被 API 封锁）
app.post('/api/lottery/sync', async (req, res) => {
  const codes = req.body?.codes || Object.keys(LOTTERY_DATA)
  const count = req.body?.count || 100
  try {
    const updated = await syncData(codes, count)
    res.json({ success: true, updated })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// 数据导入（本地拉取后推送到服务器）
// 请求体: { token: 'xxx', data: { ssq: [...], dlt: [...], ... } }
app.post('/api/lottery/import', (req, res) => {
  const IMPORT_TOKEN = process.env.LOTTERY_IMPORT_TOKEN || 'lottery2026'
  const token = req.body?.token
  const importData = req.body?.data

  if (token !== IMPORT_TOKEN) {
    return res.json({ success: false, error: '认证失败' })
  }
  if (!importData || typeof importData !== 'object') {
    return res.json({ success: false, error: '数据格式错误' })
  }

  let totalAdded = 0
  const results = []

  for (const [code, newDraws] of Object.entries(importData)) {
    if (!Array.isArray(newDraws) || newDraws.length === 0) continue

    const existing = LOTTERY_DATA[code] || []
    const existingPeriods = new Set(existing.map(d => d.period))
    const newOnes = newDraws.filter(d => !existingPeriods.has(d.period))

    if (newOnes.length > 0) {
      LOTTERY_DATA[code] = [...newOnes, ...existing]
      clearCacheForCode(code)
      totalAdded += newOnes.length
      results.push({ code, added: newOnes.length, total: LOTTERY_DATA[code].length })
      console.log(`[IMPORT:${code}] 新增 ${newOnes.length} 期，总计 ${LOTTERY_DATA[code].length} 期`)
    } else {
      results.push({ code, added: 0, total: existing.length })
    }
  }

  if (totalAdded > 0) {
    saveData()
  }

  res.json({ success: true, totalAdded, results })
})

// 健康检查
app.get('/health', (req, res) => {
  const summary = {}
  for (const [code, arr] of Object.entries(LOTTERY_DATA)) {
    summary[code] = { periods: arr.length, latest: arr[0] ? `${arr[0].period} (${arr[0].date})` : 'N/A' }
  }
  res.json({
    ok: true,
    data: summary,
    cacheKeys: cache.size,
    time: new Date().toISOString(),
  })
})

// ============ 启动时自动同步一次 ============

async function autoSyncOnStart() {
  console.log('启动自动同步...')
  try {
    const updated = await syncData(null, 100)
    console.log('启动同步完成:', updated.filter(u => u.added > 0).map(u => `${u.code}+${u.added}`).join(', ') || '无新数据')
  } catch (e) {
    console.error('启动同步失败:', e.message)
  }
}

// ============ 启动 ============

app.listen(PORT, () => {
  console.log(`彩票数据服务已启动: http://0.0.0.0:${PORT}`)
  console.log(`  首页数据: GET /api/lottery/all-latest`)
  console.log(`  历史数据: GET /api/lottery/:code/history?count=50`)
  console.log(`  遗漏查询: GET /api/lottery/:code/missing?page=1&pageSize=25&pos=0`)
  console.log(`  数据同步: POST /api/lottery/sync`)
  console.log(`  健康检查: GET /health`)
  // 延迟 3 秒后自动同步
  setTimeout(autoSyncOnStart, 3000)
})

module.exports = { app, syncData, loadData, saveData, LOTTERY_DATA }
