// pages/calculator/calculator.js
const lottery = require('../../utils/lottery')
const api = require('../../utils/api')

Page({
  data: {
    lotteryTypes: [
      { code:'ssq',name:'双色球' },{ code:'fc3d',name:'福彩3D' },{ code:'kl8',name:'快乐8' },
      { code:'qlc',name:'七乐彩' },{ code:'dlt',name:'大乐透' },{ code:'pl3',name:'排列三' },
      { code:'pl5',name:'排列五' },{ code:'qxc',name:'七星彩' },
    ],
    currentLottery: 'ssq',
    drawData: null,

    // 球号选择区
    zones: [],
    // 数字位置选择区
    digits: [],
    // KL8
    kl8Count: 10,

    checkResult: null,
    selectedCount: 0,
    loading: false,
  },

  onLoad() { this.init('ssq') },

  onSwitchLottery(e) { this.init(e.currentTarget.dataset.code) },

  async init(code) {
    this.setData({ loading: true, currentLottery: code })

    // 先设置 UI 结构
    const data = { currentLottery: code, zones: [], digits: [], checkResult: null, selectedCount: 0 }

    if (code === 'ssq') {
      data.zones = [
        { label:'红球（选6个）', max:6, nums: rng(1,33), selected:[], selObj:{}, cls:'r' },
        { label:'蓝球（选1个）', max:1, nums: rng(1,16), selected:[], selObj:{}, cls:'b' },
      ]
    } else if (code === 'qlc') {
      data.zones = [
        { label:'基本号（选7个）', max:7, nums: rng(1,30), selected:[], selObj:{}, cls:'r' },
        { label:'特别号（选1个）', max:1, nums: rng(1,30), selected:[], selObj:{}, cls:'y' },
      ]
    } else if (code === 'dlt') {
      data.zones = [
        { label:'前区（选5个）', max:5, nums: rng(1,35), selected:[], selObj:{}, cls:'r' },
        { label:'后区（选2个）', max:2, nums: rng(1,12), selected:[], selObj:{}, cls:'y' },
      ]
    } else if (code === 'kl8') {
      data.zones = [
        { label:'选'+this.data.kl8Count+'个号', max:this.data.kl8Count, nums: rng(1,80), selected:[], selObj:{}, cls:'p' },
      ]
    } else if (code === 'fc3d' || code === 'pl3') {
      data.digits = [
        { label:'百位', val:'' },{ label:'十位', val:'' },{ label:'个位', val:'' },
      ]
    } else if (code === 'pl5') {
      data.digits = [
        { label:'万位',val:'' },{ label:'千位',val:'' },{ label:'百位',val:'' },
        { label:'十位',val:'' },{ label:'个位',val:'' },
      ]
    } else if (code === 'qxc') {
      data.digits = []
      for (let i=1;i<=7;i++) data.digits.push({ label:'第'+i+'位', val:'' })
    }

    this.setData(data)

    // 异步获取开奖数据
    try {
      const { data: draw } = await api.fetchLatest(code)
      this.setData({ drawData: draw, loading: false })
    } catch (e) {
      this.setData({ drawData: null, loading: false })
      wx.showToast({ title: '开奖数据获取失败', icon: 'none' })
    }
  },

  // 球号点击
  onBallTap(e) {
    const zi = Number(e.currentTarget.dataset.zi)
    const n = Number(e.currentTarget.dataset.n)
    const zones = JSON.parse(JSON.stringify(this.data.zones))
    const zone = zones[zi]
    if (!zone) return

    const idx = zone.selected.indexOf(n)

    if (idx >= 0) {
      zone.selected.splice(idx, 1)
      delete zone.selObj[n]
    } else if (zone.selected.length < zone.max) {
      zone.selected.push(n)
      zone.selected.sort((a, b) => a - b)
      zone.selObj[n] = true
    } else {
      return wx.showToast({ title: zone.label + '最多选' + zone.max + '个', icon: 'none' })
    }

    const selectedCount = zones.reduce((s, z) => s + z.selected.length, 0)
    this.setData({ zones, selectedCount })
  },

  // 数字点击
  onDigitTap(e) {
    const di = e.currentTarget.dataset.di
    const v = e.currentTarget.dataset.v
    const digits = this.data.digits
    digits[di].val = String(v)
    this.setData({ digits })
  },

  // KL8选号数量
  onKl8CountChange(e) {
    const count = Number(e.detail.value)
    this.setData({ kl8Count: count })
    if (this.data.currentLottery === 'kl8') {
      const zones = this.data.zones
      zones[0].max = count
      zones[0].label = '选'+count+'个号'
      zones[0].selected = []
      this.setData({ zones, selectedCount: 0 })
    }
  },

  // 机选
  quickRandom() {
    const code = this.data.currentLottery
    const data = {}
    if (code === 'ssq') {
      const reds = lottery.shuffleArray(rng(1,33)).slice(0,6).sort((a,b)=>a-b)
      data['zones[0].selected'] = reds
      data['zones[0].selObj'] = {}
      reds.forEach(n => data['zones[0].selObj'][n] = true)
      data['zones[1].selected'] = [lottery.randomInt(1,16)]
      data['zones[1].selObj'] = { [data['zones[1].selected'][0]]: true }
    } else if (code === 'qlc') {
      const main = lottery.shuffleArray(rng(1,30)).slice(0,7).sort((a,b)=>a-b)
      data['zones[0].selected'] = main
      data['zones[0].selObj'] = {}
      main.forEach(n => data['zones[0].selObj'][n] = true)
      data['zones[1].selected'] = [lottery.randomInt(1,30)]
      data['zones[1].selObj'] = { [data['zones[1].selected'][0]]: true }
    } else if (code === 'dlt') {
      const front = lottery.shuffleArray(rng(1,35)).slice(0,5).sort((a,b)=>a-b)
      const back = lottery.shuffleArray(rng(1,12)).slice(0,2).sort((a,b)=>a-b)
      data['zones[0].selected'] = front
      data['zones[0].selObj'] = {}
      front.forEach(n => data['zones[0].selObj'][n] = true)
      data['zones[1].selected'] = back
      data['zones[1].selObj'] = {}
      back.forEach(n => data['zones[1].selObj'][n] = true)
    } else if (code === 'kl8') {
      const nums = lottery.shuffleArray(rng(1,80)).slice(0,this.data.kl8Count)
      data['zones[0].selected'] = nums
      data['zones[0].selObj'] = {}
      nums.forEach(n => data['zones[0].selObj'][n] = true)
    } else if (code === 'fc3d' || code === 'pl3') {
      data.digits = [{label:'百位',val:String(Math.floor(Math.random()*10))}, {label:'十位',val:String(Math.floor(Math.random()*10))}, {label:'个位',val:String(Math.floor(Math.random()*10))}]
    } else if (code === 'pl5') {
      data.digits = [{label:'万位',val:String(Math.floor(Math.random()*10))}, {label:'千位',val:String(Math.floor(Math.random()*10))}, {label:'百位',val:String(Math.floor(Math.random()*10))}, {label:'十位',val:String(Math.floor(Math.random()*10))}, {label:'个位',val:String(Math.floor(Math.random()*10))}]
    } else if (code === 'qxc') {
      data.digits = []
      for (let i=1;i<=7;i++) data.digits.push({label:'第'+i+'位',val:String(Math.floor(Math.random()*10))})
    }
    // 计算已选号码总数
    let selectedCount = 0
    if (code === 'ssq') selectedCount = 7
    else if (code === 'qlc') selectedCount = 8
    else if (code === 'dlt') selectedCount = 7
    else if (code === 'kl8') selectedCount = this.data.kl8Count
    this.setData({ ...data, checkResult: null, selectedCount })
  },

  // 清空
  clearAll() {
    const zones = this.data.zones.map(z => ({...z, selected:[], selObj:{}}))
    const digits = this.data.digits.map(d => ({...d, val:''}))
    this.setData({ zones, digits, checkResult: null, selectedCount: 0 })
  },

  // 兑奖
  doCheck() {
    const { currentLottery, zones, digits, drawData } = this.data
    if (!drawData) return wx.showToast({ title:'暂无开奖数据', icon:'none' })

    let result = null

    if (zones.length > 0) {
      // 球号型
      const selAll = zones.flatMap(z => z.selected)
      const maxCount = zones.reduce((s,z)=>s+z.max, 0)
      if (selAll.length < maxCount) return wx.showToast({ title:'请选完所有号码', icon:'none' })

      if (currentLottery === 'ssq') {
        result = lottery.checkSSQ(zones[0].selected, zones[1].selected[0], drawData)
      } else if (currentLottery === 'qlc') {
        result = lottery.checkQLC(zones[0].selected, zones[1].selected[0], drawData)
      } else if (currentLottery === 'dlt') {
        result = lottery.checkDLT(zones[0].selected, zones[1].selected, drawData)
      } else if (currentLottery === 'kl8') {
        result = lottery.checkKL8(zones[0].selected, drawData)
      }
    } else {
      // 数字型
      const vals = digits.map(d => parseInt(d.val))
      if (vals.some(v => isNaN(v))) return wx.showToast({ title:'请选择每位数字', icon:'none' })
      if (currentLottery === 'fc3d') result = lottery.checkFC3D(vals, drawData)
      else if (currentLottery === 'pl3') result = lottery.checkPL3(vals, drawData)
      else if (currentLottery === 'pl5') result = lottery.checkPL5(vals, drawData)
      else if (currentLottery === 'qxc') result = lottery.checkQXC(vals, drawData)
    }

    this.setData({ checkResult: result })
  },
})

function rng(a,b){const r=[];for(let i=a;i<=b;i++)r.push(i);return r}
