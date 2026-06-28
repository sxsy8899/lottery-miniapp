// pages/missing/missing.js
const api = require('../../utils/api')

Page({
  data: {
    lotteryTypes: [
      { code:'ssq',name:'双色球' },{ code:'fc3d',name:'福彩3D' },
      { code:'kl8',name:'快乐8' },{ code:'qlc',name:'七乐彩' },
      { code:'dlt',name:'大乐透' },{ code:'pl3',name:'排列三' },
      { code:'pl5',name:'排列五' },{ code:'qxc',name:'七星彩' },
    ],
    currentLottery: 'fc3d',
    posLabels: [],
    currentPos: 0,
    showPosBar: false,
    dataList: [],
    currentPage: 1, totalPages: 1, pageSize: 25,
    totalCount: 0,
    pageTitle: '', dataRange: '',
    loading: false,
    loadError: false,
  },

  onLoad() { this.loadData() },

  switchLottery(e) {
    const code = e.currentTarget.dataset.code
    const dc = {fc3d:3,pl3:3,pl5:5,qxc:7}
    const posLabels = {fc3d:['百位','十位','个位'],pl3:['百位','十位','个位'],
      pl5:['万位','千位','百位','十位','个位'],qxc:['第1位','第2位','第3位','第4位','第5位','第6位','第7位']}
    this.setData({
      currentLottery: code, currentPage:1, currentPos:0,
      showPosBar: !!dc[code],
      posLabels: posLabels[code] || [],
    })
    this.loadData()
  },

  switchPos(e) {
    const pos = Number(e.currentTarget.dataset.pos)
    this.setData({ currentPos: pos, currentPage:1 })
    this.loadData()
  },

  goPage(e) {
    let page = e.currentTarget.dataset.page
    if (page < 1 || page > this.data.totalPages) return
    this.setData({ currentPage: page })
    this.loadData()
  },

  async loadData() {
    const { currentLottery, currentPage, pageSize, currentPos } = this.data
    this.setData({ loading: true, loadError: false })
    try {
      const { data: result } = await api.fetchMissing(currentLottery, currentPage, pageSize, currentPos)
      const list = result.list.map(item => ({...item, digits: item.number.split('')}))

      const posTitle = this.data.showPosBar && this.data.posLabels.length > 0 ?
        `(${this.data.posLabels[currentPos]})` : ''

      this.setData({
        dataList: list,
        totalPages: result.totalPages,
        totalCount: result.total,
        pageTitle: result.title + posTitle,
        dataRange: `共${result.total}个号码 · ${currentPage}/${result.totalPages}页`,
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false, loadError: true })
    }
  },

  retry() {
    this.loadData()
  },
})
