// pages/index/index.js
const api = require('../../utils/api')

function fmtPeriod(p) {
  if (!p) return ''
  return '第' + p + '期'
}

function isToday(d) {
  if (!d) return false
  const now = new Date()
  const m = String(now.getMonth()+1).padStart(2,'0')
  const day = String(now.getDate()).padStart(2,'0')
  return d === `${now.getFullYear()}-${m}-${day}`
}

Page({
  data: {
    welfareList: [],
    sportsList: [],
    updateTime: '',
    loading: true,
    loadError: false,
  },

  onLoad() {
    this.loadRealData()
  },

  onPullDownRefresh() {
    this.loadRealData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadRealData() {
    this.setData({ loading: true, loadError: false })
    try {
      const { data, source } = await api.fetchAllLatest()

      const welfareList = [
        { code:'ssq',name:'双色球',schedule:'每周二、四、日开奖',logoImage:'../../images/logo-ssq.png',
          data: this.fmt(data.ssq) },
        { code:'fc3d',name:'福彩3D',schedule:'每天开奖',logoImage:'../../images/logo-fc3d.png',
          data: this.fmt(data.fc3d) },
        { code:'qlc',name:'七乐彩',schedule:'每周一、三、五开奖',logoImage:'../../images/logo-qlc.png',
          data: this.fmt(data.qlc) },
        { code:'kl8',name:'快乐8',schedule:'每天开奖',logoImage:'../../images/logo-kl8.png',
          data: this.fmt(data.kl8) },
      ]
      const sportsList = [
        { code:'dlt',name:'大乐透',schedule:'每周一、三、六开奖',logoImage:'../../images/logo-dlt.png',
          data: this.fmt(data.dlt) },
        { code:'pl3',name:'排列三',schedule:'每天开奖',logoImage:'../../images/logo-pl3.png',
          data: this.fmt(data.pl3) },
        { code:'pl5',name:'排列五',schedule:'每天开奖',logoImage:'../../images/logo-pl5.png',
          data: this.fmt(data.pl5) },
        { code:'qxc',name:'七星彩',schedule:'每周二、五、日开奖',logoImage:'../../images/logo-qxc.png',
          data: this.fmt(data.qxc) },
      ]
      this.setData({
        welfareList, sportsList,
        updateTime: '数据更新于 ' + new Date().toLocaleDateString('zh-CN') +
          (source === 'cache' ? '（离线缓存）' : ''),
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false, loadError: true })
    }
  },

  fmt(d) {
    if (!d) return null
    return { ...d, periodFmt: fmtPeriod(d.period), isNew: isToday(d.date) }
  },

  // 重试
  retry() {
    this.loadRealData()
  },

  goDetail(e) {
    const code = e.currentTarget.dataset.code
    getApp().globalData.pendingTrendCode = code
    wx.switchTab({ url: '/pages/trend/trend' })
  }
})
