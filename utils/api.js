/**
 * API 客户端 - 负责从服务端获取数据 + 本地缓存
 */
const config = require('./config')

// ============ 本地缓存工具 ============

function getCache(key) {
  try {
    const item = wx.getStorageSync(key)
    if (!item) return null
    if (Date.now() - item.time > item.ttl) {
      wx.removeStorageSync(key)
      return null
    }
    return item.data
  } catch (e) {
    return null
  }
}

function setCache(key, data, ttl) {
  try {
    wx.setStorageSync(key, { data, time: Date.now(), ttl })
  } catch (e) {
    // 存储满时忽略
  }
}

// ============ 网络请求封装 ============

function request(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      timeout: 30000,
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.success) {
          resolve(res.data)
        } else {
          reject(new Error((res.data && res.data.error) || '请求失败'))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络连接失败，请检查网络设置'))
      }
    })
  })
}

// ============ API 方法 ============

/**
 * 获取所有彩种最新一期（首页用）
 * @returns {Promise<{data: Object, source: string}>}
 */
async function fetchAllLatest() {
  const cacheKey = 'cache_allLatest'
  const cached = getCache(cacheKey)

  try {
    const res = await request(`${config.API_BASE}/api/lottery/all-latest`)
    setCache(cacheKey, res.data, config.CACHE_TTL.allLatest)
    return { data: res.data, source: 'server' }
  } catch (e) {
    if (cached) return { data: cached, source: 'cache' }
    throw e
  }
}

/**
 * 获取单个彩种最新一期
 * @param {string} code - 彩种代码
 * @returns {Promise<{data: Object, source: string}>}
 */
async function fetchLatest(code) {
  const cacheKey = `cache_latest_${code}`
  const cached = getCache(cacheKey)

  try {
    const res = await request(`${config.API_BASE}/api/lottery/${code}/latest`)
    setCache(cacheKey, res.data, config.CACHE_TTL.latest)
    return { data: res.data, source: 'server' }
  } catch (e) {
    if (cached) return { data: cached, source: 'cache' }
    throw e
  }
}

/**
 * 获取历史数据（走势图用）
 * @param {string} code - 彩种代码
 * @param {number} count - 获取条数
 * @returns {Promise<{data: Array, source: string, total: number}>}
 */
async function fetchHistory(code, count = 50) {
  const cacheKey = `cache_history_${code}_${count}`
  const cached = getCache(cacheKey)

  try {
    const res = await request(`${config.API_BASE}/api/lottery/${code}/history?count=${count}`)
    setCache(cacheKey, res.data, config.CACHE_TTL.history)
    return { data: res.data, source: 'server', total: res.total }
  } catch (e) {
    if (cached) return { data: cached, source: 'cache', total: cached.length }
    throw e
  }
}

/**
 * 获取遗漏数据（遗漏查询页用，服务端计算）
 * @param {string} code - 彩种代码
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {number} pos - 位置（数字型彩种用）
 * @returns {Promise<{data: Object, source: string}>}
 */
async function fetchMissing(code, page = 1, pageSize = 25, pos = 0) {
  const cacheKey = `cache_missing_${code}_${page}_${pageSize}_${pos}`
  const cached = getCache(cacheKey)

  try {
    const res = await request(
      `${config.API_BASE}/api/lottery/${code}/missing?page=${page}&pageSize=${pageSize}&pos=${pos}`
    )
    setCache(cacheKey, res.data, config.CACHE_TTL.missing)
    return { data: res.data, source: 'server' }
  } catch (e) {
    if (cached) return { data: cached, source: 'cache' }
    throw e
  }
}

/**
 * 获取数据范围
 * @param {string} code - 彩种代码
 * @returns {Promise<{data: Object}>}
 */
async function fetchRange(code) {
  try {
    const res = await request(`${config.API_BASE}/api/lottery/${code}/range`)
    return { data: res.data }
  } catch (e) {
    return { data: null }
  }
}

module.exports = {
  fetchAllLatest,
  fetchLatest,
  fetchHistory,
  fetchMissing,
  fetchRange,
}
