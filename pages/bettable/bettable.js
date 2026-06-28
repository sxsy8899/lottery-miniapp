// pages/bettable/bettable.js
const lottery = require('../../utils/lottery')

Page({
  data: {
    lotteryTabs: [
      { code: 'ssq', name: '双色球' },
      { code: 'dlt', name: '大乐透' },
      { code: 'fc3d', name: '福彩3D' },
      { code: 'pl3', name: '排列三' },
      { code: 'qlc', name: '七乐彩' }
    ],
    currentLottery: 'ssq',
    betTypes: {
      ssq: ['复式(红球)', '复式(蓝球)', '胆拖(红球)', '单式'],
      dlt: ['复式(前区)', '复式(后区)', '胆拖', '单式'],
      fc3d: ['直选复式', '组选3', '组选6', '和值'],
      pl3: ['直选复式', '组选3', '组选6', '和值'],
      qlc: ['复式', '胆拖', '单式']
    },
    currentBetType: '复式(红球)',
    inputCount: 7,
    needInput: true,
    priceOptions: ['2', '1', '5', '10'],
    priceIndex: 0,
    multiplier: 1,
    totalBets: 0,
    totalAmount: 0,
    referenceTable: [],
    tips: []
  },

  onLoad() {
    this.updateCalc()
  },

  switchLottery(e) {
    const code = e.currentTarget.dataset.code
    const types = this.data.betTypes[code]
    this.setData({
      currentLottery: code,
      currentBetType: types[0],
      inputCount: code === 'ssq' ? 7 : (code === 'dlt' ? 6 : 4)
    })
    this.updateCalc()
  },

  switchBetType(e) {
    this.setData({ currentBetType: e.currentTarget.dataset.type })
    this.updateCalc()
  },

  onInputCount(e) {
    this.setData({ inputCount: Number(e.detail.value) || 0 })
    this.updateCalc()
  },

  onPriceChange(e) {
    this.setData({ priceIndex: Number(e.detail.value) })
    this.updateCalc()
  },

  onMultiplierInput(e) {
    this.setData({ multiplier: Number(e.detail.value) || 1 })
    this.updateCalc()
  },

  updateCalc() {
    const { currentLottery, currentBetType, inputCount, priceIndex, multiplier } = this.data
    const unitPrice = Number(this.data.priceOptions[priceIndex])
    let bets = 0
    let refTable = []
    let tips = []
    let needInput = true

    // 根据彩票类型和投注方式计算注数
    if (currentLottery === 'ssq') {
      if (currentBetType === '复式(红球)') {
        // 红球复式：C(n,6)，n>=6
        const n = Math.max(inputCount, 6)
        bets = lottery.combination(n, 6)
        tips = [
          '双色球红球从33个号码中选6个',
          `当前${n}个红球共${bets}种组合`,
          '每注还需选择1个蓝球（1-16）',
          '建议：红球复式不超过12个'
        ]
        // 参考表：6-15个红球
        for (let i = 6; i <= 15; i++) {
          refTable.push({
            count: i, bets: lottery.combination(i, 6), amount: lottery.combination(i, 6) * unitPrice * multiplier
          })
        }
      } else if (currentBetType === '复式(蓝球)') {
        const n = Math.max(inputCount, 1)
        bets = n
        tips = ['蓝球复式：选n个蓝球，每注配6个固定红球', '注数=蓝球数量']
        for (let i = 1; i <= 16; i++) {
          refTable.push({ count: i, bets: i, amount: i * unitPrice * multiplier })
        }
      } else if (currentBetType === '胆拖(红球)') {
        tips = ['胆拖：胆码必选 + 拖码凑够6个', '例如：2个胆码+6个拖码=C(6,4)=15注']
        needInput = false
        bets = 0
        for (let dan = 1; dan <= 4; dan++) {
          for (let tuo = 6 - dan; tuo <= 20 - dan; tuo++) {
            if (tuo > 10) break
            refTable.push({
              count: `${dan}胆+${tuo}拖`,
              bets: lottery.combination(tuo, 6 - dan),
              amount: lottery.combination(tuo, 6 - dan) * unitPrice * multiplier
            })
            if (refTable.length >= 12) break
          }
          if (refTable.length >= 12) break
        }
      } else {
        bets = 1
        needInput = false
        tips = ['单式：标准投注，1注2元']
      }
    } else if (currentLottery === 'dlt') {
      if (currentBetType === '复式(前区)') {
        const n = Math.max(inputCount, 5)
        bets = lottery.combination(n, 5) * 1 // 后区默认2个
        tips = ['大乐透前区35选5，后区12选2', `前区${n}个号共${bets}注`]
        for (let i = 5; i <= 12; i++) {
          refTable.push({ count: i, bets: lottery.combination(i, 5), amount: lottery.combination(i, 5) * unitPrice * multiplier })
        }
      } else if (currentBetType === '复式(后区)') {
        const n = Math.max(inputCount, 2)
        bets = lottery.combination(n, 2)
        for (let i = 2; i <= 8; i++) {
          refTable.push({ count: i, bets: lottery.combination(i, 2), amount: lottery.combination(i, 2) * unitPrice * multiplier })
        }
      } else {
        bets = 1
        needInput = false
      }
    } else if (currentLottery === 'fc3d' || currentLottery === 'pl3') {
      if (currentBetType === '直选复式') {
        const n = Math.max(inputCount, 1)
        bets = Math.pow(n, 3) // 每位n个号
        tips = [`直选复式每位选${n}个号`, `共${bets}注`]
        for (let i = 1; i <= 9; i++) {
          refTable.push({ count: i, bets: Math.pow(i, 3), amount: Math.pow(i, 3) * unitPrice * multiplier })
        }
      } else if (currentBetType === '组选3') {
        const n = Math.max(inputCount, 2)
        bets = lottery.combination(n, 2) * 2 // 2个不同号组成组选3
        tips = ['组选3：2个不同数字的排列(如112,121,211)']
        for (let i = 2; i <= 10; i++) {
          refTable.push({ count: i, bets: lottery.combination(i, 2) * 2, amount: lottery.combination(i, 2) * 2 * unitPrice * multiplier })
        }
      } else if (currentBetType === '组选6') {
        const n = Math.max(inputCount, 3)
        bets = lottery.combination(n, 3)
        tips = ['组选6：3个不同数字的组合']
        for (let i = 3; i <= 10; i++) {
          refTable.push({ count: i, bets: lottery.combination(i, 3), amount: lottery.combination(i, 3) * unitPrice * multiplier })
        }
      } else if (currentBetType === '和值') {
        const sumVal = Math.min(Math.max(inputCount || 13, 0), 27)
        bets = this.calcSumCount(sumVal)
        tips = [`和值为${sumVal}时共有${bets}注`, '和值范围：0-27']
        for (let s = 0; s <= 27; s += 3) {
          refTable.push({ count: `和值${s}`, bets: this.calcSumCount(s), amount: this.calcSumCount(s) * unitPrice * multiplier })
        }
      }
    } else if (currentLottery === 'qlc') {
      if (currentBetType === '复式') {
        const n = Math.max(inputCount, 7)
        bets = lottery.combination(n, 7)
        tips = ['七乐彩30选7', `选${n}个号共${bets}注`]
        for (let i = 7; i <= 14; i++) {
          refTable.push({ count: i, bets: lottery.combination(i, 7), amount: lottery.combination(i, 7) * unitPrice * multiplier })
        }
      } else {
        bets = 1
        needInput = false
      }
    }

    const totalAmount = bets * unitPrice * multiplier

    this.setData({
      totalBets: bets,
      totalAmount,
      referenceTable: refTable,
      tips,
      needInput,
      currentBetTypeName: currentBetType
    })

    // 保存最新结果用于复制
    this.lastResult = { totalBets: bets, totalAmount, refTable, currentBetTypeName: currentBetType }
  },

  // 复制投注表到剪贴板
  copyTable() {
    if (!this.lastResult) return wx.showToast({ title: '请先计算', icon: 'none' })
    const { totalBets, totalAmount, refTable, currentBetTypeName } = this.lastResult
    let text = `${currentBetTypeName} 投注参考表\n`
    text += `当前计算结果：${totalBets}注 共${totalAmount}元\n\n`
    text += '选号数\t注数\t金额(元)\n'
    for (const item of refTable) {
      text += `${item.count}\t${item.bets}注\t${item.amount}元\n`
    }
    wx.setClipboardData({ data: text })
    wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
  },

  // 计算福彩3D/排列三某和值的注数
  calcSumCount(sum) {
    if (sum < 0 || sum > 27) return 0
    let count = 0
    for (let a = 0; a <= 9; a++)
      for (let b = 0; b <= 9; b++)
        for (let c = 0; c <= 9; c++)
          if (a + b + c === sum) count++
    return count
  }
})
