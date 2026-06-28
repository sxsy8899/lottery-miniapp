#!/usr/bin/env node
/**
 * 定时同步脚本 - 可被 cron 调用
 * 用法: node sync.js
 * 
 * 功能：从官网拉取最新开奖数据，合并到本地 JSON 文件
 * 不启动 Express 服务，纯数据同步
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

const DATA_FILE = path.join(__dirname, 'data', 'lottery-data.json')

// ============ 数据加载 ============

let LOTTERY_DATA = {}

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8')
    LOTTERY_DATA = JSON.parse(raw)
    console.log('数据加载完成')
  } catch (e) {
    console.error('数据文件加载失败:', e.message)
    process.exit(1)
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(LOTTERY_DATA))
    console.log('数据已保存到文件')
  } catch (e) {
    console.error('数据保存失败:', e.message)
  }
}

// ============ HTTP 请求 ============

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

// ============ 数据源 ============

const CWL_API_MAP = {
  ssq: 'ssq', fc3d: 'fc3d', qlc: 'qlc', kl8: 'kl8',
}
const TC_GAMENO_MAP = {
  dlt: '85', pl3: '03', pl5: '05', qxc: '04',
}

async function fetchCWL(code, count) {
  const name = CWL_API_MAP[code]
  if (!name) return []
  const apiUrl = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=${name}&issueCount=${count}&systemType=PC`
  try {
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
      if (code === 'ssq' || code === 'qlc') {
        entry.reds = (item.red || '').split(',').map(Number).filter(n => !isNaN(n))
        entry.blue = Number(item.blue)
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
      return []
    }
    const json = JSON.parse(resp.body)
    const drawList = json?.value?.pageList || []
    if (!drawList.length) return []

    const results = []
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
      } else {
        entry.numbers = result.split(/[,，\s]+/).map(Number).filter(n => !isNaN(n))
      }
      results.push(entry)
    }
    console.log(`[TC:${code}] 获取 ${results.length} 期`)
    return results
  } catch (e) {
    console.error(`[TC:${code}]`, e.message)
    return []
  }
}

// ============ 同步逻辑 ============

async function sync() {
  loadData()

  const codes = Object.keys(LOTTERY_DATA)
  console.log(`开始同步 ${codes.length} 个彩种: ${codes.join(', ')}`)
  console.log(`时间: ${new Date().toISOString()}`)
  console.log('---')

  let totalAdded = 0
  const results = []

  for (const code of codes) {
    let newData = []
    if (CWL_API_MAP[code]) {
      newData = await fetchCWL(code, 100)
    } else if (TC_GAMENO_MAP[code]) {
      newData = await fetchTC(code, 100)
    }

    if (newData.length > 0) {
      const existing = LOTTERY_DATA[code] || []
      const existingPeriods = new Set(existing.map(d => d.period))
      const newOnes = newData.filter(d => !existingPeriods.has(d.period))

      if (newOnes.length > 0) {
        LOTTERY_DATA[code] = [...newOnes, ...existing]
        totalAdded += newOnes.length
        results.push({ code, added: newOnes.length, total: LOTTERY_DATA[code].length })
        console.log(`✓ ${code}: 新增 ${newOnes.length} 期，总计 ${LOTTERY_DATA[code].length} 期`)
      } else {
        results.push({ code, added: 0, total: existing.length })
        console.log(`  ${code}: 无新数据（已有 ${existing.length} 期）`)
      }
    } else {
      results.push({ code, added: 0, total: (LOTTERY_DATA[code] || []).length, error: true })
      console.log(`✗ ${code}: 获取失败`)
    }

    // 请求间隔，避免被封
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('---')
  if (totalAdded > 0) {
    saveData()
    console.log(`同步完成！新增 ${totalAdded} 期数据`)
  } else {
    console.log('同步完成！无新数据')
  }
  console.log(`时间: ${new Date().toISOString()}`)

  // 退出
  process.exit(0)
}

sync().catch(e => {
  console.error('同步脚本异常:', e)
  process.exit(1)
})
