/**
 * 彩票工具库
 * 数据获取已移至 utils/api.js（服务端 API + 本地缓存）
 * 本文件仅保留：工具函数、兑奖比对、奖金计算
 */

// ==================== 工具函数 ====================

function range(start, end) {
  const arr = []
  for (let i = start; i <= end; i++) arr.push(i)
  return arr
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function formatPeriod(suffix) {
  suffix = suffix || '067'
  const now = new Date()
  const y = now.getFullYear()
  return `${y}${suffix}`
}

function formatDate() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// ==================== 奖金计算 ====================

function calcSSQComplex(redCount, blueCount, hitRed, hitBlue) {
  const pricePerBet = 2
  const bets = combination(redCount, 6) * combination(blueCount, 1)
  const totalCost = bets * pricePerBet

  let prize = 0
  if (hitRed === 6 && hitBlue === 1) prize = 5000000
  else if (hitRed === 6 && hitBlue === 0) prize = 200000
  else if (hitRed === 5 && hitBlue === 1) prize = 3000
  else if (hitRed === 5 || (hitRed === 4 && hitBlue === 1)) prize = 200
  else if (hitRed === 4 || (hitRed === 3 && hitBlue === 1)) prize = 10
  else if (hitBlue === 1) prize = 5
  else prize = 0

  return { prize, totalCost, bets }
}

function calcSSQDrag(danRed, tuoRed, danBlue, tuoBlue, hitDanR, hitTuoR, hitDanB, hitTuoB) {
  const needRed = 6
  const needBlue = 1
  const pricePerBet = 2

  const redBets = combination(tuoRed, needRed - Math.min(danRed, needRed))
  const blueBets = combination(tuoBlue, needBlue - Math.min(danBlue, needBlue))
  const bets = redBets * blueBets
  const totalCost = bets * pricePerBet

  const totalHitRed = Math.min(hitDanR, danRed) + Math.min(hitTuoR, tuoRed)
  const totalHitBlue = Math.min(hitDanB, danBlue) + Math.min(hitTuoB, tuoBlue)

  let prize = 0
  if (totalHitRed >= 6 && totalHitBlue >= 1) prize = 5000000
  else if (totalHitRed >= 6) prize = 200000
  else if (totalHitRed >= 5 && totalHitBlue >= 1) prize = 3000
  else if (totalHitRed >= 5 || (totalHitRed >= 4 && totalHitBlue >= 1)) prize = 200
  else if (totalHitRed >= 4 || (totalHitRed >= 3 && totalHitBlue >= 1)) prize = 10
  else if (totalHitBlue >= 1) prize = 5

  return { prize, totalCost, bets }
}

function calcDLTComplex(frontCount, backCount, hitFront, hitBack) {
  const pricePerBet = 2
  const bets = combination(frontCount, 5) * combination(backCount, 2)
  const totalCost = bets * pricePerBet

  let prize = 0
  if (hitFront === 5 && hitBack === 2) prize = 10000000
  else if (hitFront === 5 && hitBack === 1) prize = 100000
  else if ((hitFront === 5 && hitBack === 0) || (hitFront === 4 && hitBack === 2)) prize = 3000
  else if ((hitFront === 4 && hitBack === 1) || (hitFront === 3 && hitBack === 2)) prize = 200
  else if ((hitFront === 4 && hitBack === 0) || (hitFront === 3 && hitBack === 1) || (hitFront === 2 && hitBack === 2)) prize = 10
  else if ((hitFront === 3 && hitBack === 0) || (hitFront === 2 && hitBack === 1) || (hitFront === 1 && hitBack === 2) || (hitFront === 0 && hitBack === 2)) prize = 5

  return { prize, totalCost, bets }
}

function combination(n, k) {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1
  if (k > n / 2) k = n - k
  let result = 1
  for (let i = 1; i <= k; i++) {
    result = result * (n - k + i) / i
  }
  return Math.round(result)
}

// ==================== 兑奖比对 ====================

function checkSSQ(userReds, userBlue, draw) {
  const redMatch = userReds.filter(r => draw.reds.includes(r)).length
  const blueHit = userBlue === draw.blue
  const matched = { reds: redMatch, blue: blueHit }

  let level = 0, prize = '未中奖'
  if (redMatch === 6 && blueHit) { level = 1; prize = '一等奖（浮动奖金）' }
  else if (redMatch === 6 && !blueHit) { level = 2; prize = '二等奖（浮动奖金）' }
  else if (redMatch === 5 && blueHit) { level = 3; prize = '三等奖 3,000元' }
  else if ((redMatch === 5 && !blueHit) || (redMatch === 4 && blueHit)) { level = 4; prize = '四等奖 200元' }
  else if ((redMatch === 4 && !blueHit) || (redMatch === 3 && blueHit)) { level = 5; prize = '五等奖 10元' }
  else if (blueHit) { level = 6; prize = '六等奖 5元' }

  return { matched, level, prize, isWin: level > 0 }
}

function checkFC3D(userNums, draw) {
  const matchAll = userNums.length === 3 && draw.numbers.length === 3 &&
    userNums[0] === draw.numbers[0] &&
    userNums[1] === draw.numbers[1] &&
    userNums[2] === draw.numbers[2]

  const userSorted = [...userNums].sort((a, b) => a - b)
  const drawSorted = [...draw.numbers].sort((a, b) => a - b)
  const matchAny = userSorted[0] === drawSorted[0] && userSorted[1] === drawSorted[1] && userSorted[2] === drawSorted[2]

  let prize = '未中奖', level = 0
  if (matchAll) { level = 1; prize = '直选 1,040元' }
  else if (matchAny) {
    const uniqueUser = new Set(userNums).size
    if (uniqueUser === 2) { level = 2; prize = '组选3 346元' }
    else if (uniqueUser === 3) { level = 3; prize = '组选6 173元' }
  }

  return { matched: { exact: matchAll, group: matchAny }, level, prize, isWin: level > 0 }
}

function checkKL8(userNums, draw) {
  const matchCount = userNums.filter(n => draw.numbers.includes(n)).length
  const selectCount = userNums.length

  const prizeTable = {
    10: { 10: '选十中十（浮动奖）', 9: '选十中九 8,000元', 8: '选十中八 720元', 7: '选十中七 80元', 6: '选十中六 5元', 5: '选十中五 3元', 0: '选十中零 2元' },
    9:  { 9: '选九中九（浮动奖）', 8: '选九中八 2,000元', 7: '选九中七 225元', 6: '选九中六 22元', 5: '选九中五 5元', 4: '选九中四 3元', 0: '选九中零 2元' },
    8:  { 8: '选八中八 50,000元', 7: '选八中七 800元', 6: '选八中六 80元', 5: '选八中五 10元', 4: '选八中四 3元', 0: '选八中零 2元' },
    7:  { 7: '选七中七 8,500元', 6: '选七中六 300元', 5: '选七中五 30元', 4: '选七中四 4元', 0: '选七中零 2元' },
    6:  { 6: '选六中六 2,880元', 5: '选六中五 30元', 4: '选六中四 10元', 3: '选六中三 3元' },
    5:  { 5: '选五中五 1,000元', 4: '选五中四 20元', 3: '选五中三 3元' },
    4:  { 4: '选四中四 93元', 3: '选四中三 5元', 2: '选四中二 3元' },
    3:  { 3: '选三中三 52元', 2: '选三中二 3元' },
    2:  { 2: '选二中二 19元' },
    1:  { 1: '选一中一 4.5元' },
  }

  const table = prizeTable[selectCount] || {}
  const prize = table[matchCount] || '未中奖'
  const isWin = prize !== '未中奖'

  return { matched: { total: matchCount, selectCount }, prize, isWin, level: isWin ? 1 : 0 }
}

function checkQLC(userNums, userSpecial, draw) {
  const mainMatch = userNums.filter(n => draw.numbers.includes(n)).length
  const specialHit = userSpecial === draw.special

  let prize = '未中奖', level = 0
  if (mainMatch === 7) { level = 1; prize = '一等奖（浮动奖金）' }
  else if (mainMatch === 6 && specialHit) { level = 2; prize = '二等奖（浮动奖金）' }
  else if (mainMatch === 6) { level = 3; prize = '三等奖 904元' }
  else if (mainMatch === 5 && specialHit) { level = 4; prize = '四等奖 200元' }
  else if (mainMatch === 5) { level = 5; prize = '五等奖 50元' }
  else if (mainMatch === 4 && specialHit) { level = 6; prize = '六等奖 10元' }
  else if (mainMatch === 4) { level = 7; prize = '七等奖 5元' }

  return { matched: { main: mainMatch, special: specialHit }, level, prize, isWin: level > 0 }
}

function checkDLT(userFront, userBack, draw) {
  const frontMatch = userFront.filter(n => draw.front.includes(n)).length
  const backMatch = userBack.filter(n => draw.back.includes(n)).length
  const matched = { front: frontMatch, back: backMatch }

  let prize = '未中奖', level = 0
  if (frontMatch === 5 && backMatch === 2) { level = 1; prize = '一等奖（浮动奖金）' }
  else if (frontMatch === 5 && backMatch === 1) { level = 2; prize = '二等奖（浮动奖金）' }
  else if ((frontMatch === 5 && backMatch === 0) || (frontMatch === 4 && backMatch === 2)) { level = 3; prize = '三等奖 6,666元' }
  else if ((frontMatch === 4 && backMatch === 1) || (frontMatch === 3 && backMatch === 2)) { level = 4; prize = '四等奖 380元' }
  else if ((frontMatch === 4 && backMatch === 0) || (frontMatch === 3 && backMatch === 1) || (frontMatch === 2 && backMatch === 2)) { level = 5; prize = '五等奖 200元' }
  else if ((frontMatch === 3 && backMatch === 0) || (frontMatch === 2 && backMatch === 1) || (frontMatch === 1 && backMatch === 2) || (frontMatch === 0 && backMatch === 2)) { level = 6; prize = '六等奖 18元' }
  else if (frontMatch === 0 && backMatch === 1) { level = 7; prize = '七等奖 7元' }

  return { matched, level, prize, isWin: level > 0 }
}

function checkPL3(userNums, draw) {
  return checkFC3D(userNums, draw)
}

function checkPL5(userNums, draw) {
  const matchAll = userNums.length === 5 && draw.numbers.length === 5 &&
    userNums.every((n, i) => n === draw.numbers[i])
  return {
    matched: { exact: matchAll },
    level: matchAll ? 1 : 0,
    prize: matchAll ? '直选 100,000元' : '未中奖',
    isWin: matchAll
  }
}

function checkQXC(userNums, draw) {
  let matchFromStart = 0
  for (let i = 0; i < Math.min(userNums.length, draw.numbers.length); i++) {
    if (userNums[i] === draw.numbers[i]) matchFromStart++
    else break
  }
  const lastMatch = userNums.length >= 7 && draw.numbers.length >= 7 &&
    userNums[6] === draw.numbers[6]

  let prize = '未中奖', level = 0
  if (matchFromStart === 6 && lastMatch) { level = 1; prize = '一等奖（浮动奖金）' }
  else if (matchFromStart === 6) { level = 2; prize = '二等奖（浮动奖金）' }
  else if (matchFromStart === 5) { level = 3; prize = '三等奖 3,000元' }
  else if (matchFromStart === 4) { level = 4; prize = '四等奖 500元' }
  else if (matchFromStart === 3) { level = 5; prize = '五等奖 30元' }
  else if (lastMatch) { level = 6; prize = '六等奖 5元' }

  return { matched: { start: matchFromStart, last: lastMatch }, level, prize, isWin: level > 0 }
}

module.exports = {
  range,
  shuffleArray,
  randomInt,
  formatPeriod,
  formatDate,
  combination,
  // 奖金计算
  calcSSQComplex,
  calcSSQDrag,
  calcDLTComplex,
  // 兑奖比对
  checkSSQ, checkFC3D, checkKL8, checkQLC,
  checkDLT, checkPL3, checkPL5, checkQXC,
}
