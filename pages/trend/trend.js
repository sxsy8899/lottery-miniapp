// pages/trend/trend.js
const api = require('../../utils/api')

const NAMES = {ssq:'双色球',fc3d:'福彩3D',kl8:'快乐8',qlc:'七乐彩',dlt:'大乐透',pl3:'排列三',pl5:'排列五',qxc:'七星彩'}

Page({
  data: {
    trendList: [
      {code:'ssq',name:'双色球',img:'../../images/logo-ssq.png'},
      {code:'fc3d',name:'福彩3D',img:'../../images/logo-fc3d.png'},
      {code:'kl8',name:'快乐8',img:'../../images/logo-kl8.png'},
      {code:'qlc',name:'七乐彩',img:'../../images/logo-qlc.png'},
      {code:'dlt',name:'大乐透',img:'../../images/logo-dlt.png'},
      {code:'pl3',name:'排列三',img:'../../images/logo-pl3.png'},
      {code:'pl5',name:'排列五',img:'../../images/logo-pl5.png'},
      {code:'qxc',name:'七星彩',img:'../../images/logo-qxc.png'},
    ],
    viewMode: 'grid',
    title: '',
    cols: [],
    rows: [],
    foot1: [],
    foot2: [],
    digitPos: 0,
    digitLabels: [],
    showPick: false,
    pickTitle: '',
    pickNums: [],
    pickCls: 'ball-red',
    showUniversal: false,
    universalCodes: [],
    loading: false,
    loadError: false,
  },

  onLoad() {
    this.setData({universalCodes:[
      {name:'双色球热号',nums:'3 7 12 18 23 29 + 5'},
      {name:'福彩3D热号',nums:'1 4 7'},
      {name:'大乐透热号',nums:'2 8 15 22 31 + 4 9'},
      {name:'排列三热号',nums:'3 6 9'},
      {name:'七星彩热号',nums:'1 3 5 7 2 4 9'},
    ]})
  },
  onShow() {
    const app = getApp()
    if (app.globalData.pendingTrendCode) {
      const c = app.globalData.pendingTrendCode
      app.globalData.pendingTrendCode = ''
      this.go(c)
    }
  },

  onTap(e) { this.go(e.currentTarget.dataset.code) },
  back() { this.setData({ viewMode:'grid' }) },

  async go(code) {
    this.setData({ viewMode:'chart', loading: true, loadError: false, title: NAMES[code]+'走势图' })
    try {
      const { data: draws } = await api.fetchHistory(code, 200)
      if (!draws || !draws.length) {
        this.setData({ loading: false, loadError: true })
        return
      }
      this.setData({ title: NAMES[code]+'走势图（近'+Math.min(draws.length,200)+'期）' })
      if (code === 'kl8') this.buildKL8(draws)
      else if (['fc3d','pl3','pl5','qxc'].includes(code)) this.buildDigit(code, draws)
      else this.buildBall(code, draws)
      this.setData({ loading: false })
    } catch (e) {
      this.setData({ loading: false, loadError: true })
    }
  },

  retry() {
    // 重试上次的彩种
    const title = this.data.title || ''
    for (const code of Object.keys(NAMES)) {
      if (title.includes(NAMES[code])) { this.go(code); return }
    }
  },

  // ====== 球号走势（SSQ/QLC/DLT）======
  buildBall(code, draws) {
    const CFG = {
      ssq:{zones:[{l:'一区',r:[1,11]},{l:'二区',r:[12,22]},{l:'三区',r:[23,33]}],eL:'蓝球',eR:[1,16],mK:'reds',eK:'blue'},
      qlc:{zones:[{l:'基本号',r:[1,30]}],eL:'特别号',eR:[1,30],mK:'numbers',eK:'special'},
      dlt:{zones:[{l:'前区',r:[1,35]}],eL:'后区',eR:[1,12],mK:'front',eK:'back'},
    }[code]
    const N = Math.min(draws.length, 200)

    const cols = []
    cols.push({w:90, text:'期号', cls:'h'})
    cols.push({w:50, text:'星期', cls:'hh'})
    CFG.zones.forEach(z => {
      cols.push({w:6, text:z.l, cls:'s', span:z.r[1]-z.r[0]+1})
      for (let n=z.r[0]; n<=z.r[1]; n++) cols.push({w:36, text:pad(n), cls:'b'})
    })
    cols.push({w:6, text:CFG.eL, cls:'s', span:CFG.eR[1]-CFG.eR[0]+1})
    for (let n=CFG.eR[0]; n<=CFG.eR[1]; n++) cols.push({w:36, text:pad(n), cls:'bb'})
    cols.push({w:60, text:'和值', cls:'hh'})
    cols.push({w:60, text:'跨度', cls:'hh'})
    cols.push({w:80, text:'区间比', cls:'hh'})
    cols.push({w:80, text:'奇偶比', cls:'hh'})

    const week = ['日','一','二','三','四','五','六']

    const rows = []
    for (let i=0; i<N; i++) {
      const d = draws[i]
      const main = d[CFG.mK] || []
      const extra = Array.isArray(d[CFG.eK]) ? d[CFG.eK] : [d[CFG.eK]].filter(v=>v!==undefined)
      const r = []
      r.push({v:sp(d.period), t:'p'})
      r.push({v:week[new Date(d.date).getDay()]||'', t:'t'})

      for (const z of CFG.zones) {
        r.push({v:'', t:'s'})
        for (let n=z.r[0]; n<=z.r[1]; n++)
          r.push(main.includes(n) ? {v:n, t:'h'} : {v:miss(draws.slice(i), d=>d[CFG.mK].includes(n)), t:'m'})
      }
      r.push({v:'', t:'s'})
      for (let n=CFG.eR[0]; n<=CFG.eR[1]; n++)
        r.push(extra.includes(n) ? {v:n, t:'he'} : {v:miss(draws.slice(i), d=>{const x=d[CFG.eK];return Array.isArray(x)?x.includes(n):x===n}), t:'m'})

      const hits = []
      for (const z of CFG.zones)
        for (let n=z.r[0]; n<=z.r[1]; n++)
          if (main.includes(n)) hits.push(n)

      r.push({v:hits.reduce((a,b)=>a+b,0), t:'t'})
      r.push({v:hits.length>0 ? Math.max(...hits)-Math.min(...hits) : '', t:'t'})
      if (CFG.zones.length===3) {
        let zc=[0,0,0]
        for (const h of hits) {if(h<=11)zc[0]++;else if(h<=22)zc[1]++;else zc[2]++}
        r.push({v:zc.join(':'), t:'t'})
      } else r.push({v:'', t:'t'})
      const odd=hits.filter(h=>h%2===1).length
      r.push({v:odd+':'+(hits.length-odd), t:'t'})

      rows.push(r)
    }

    const f1=[{v:'出现',t:'f'}], f2=[{v:'遗漏',t:'f'}]
    f1.push({v:'',t:'s'}); f2.push({v:'',t:'s'})
    for (const z of CFG.zones) {
      f1.push({v:'',t:'s'}); f2.push({v:'',t:'s'})
      for (let n=z.r[0]; n<=z.r[1]; n++) {
        f1.push({v:draws.filter(d=>d[CFG.mK].includes(n)).length, t:'n'})
        f2.push({v:miss(draws, d=>d[CFG.mK].includes(n)), t:'n'})
      }
    }
    f1.push({v:'',t:'s'}); f2.push({v:'',t:'s'})
    for (let n=CFG.eR[0]; n<=CFG.eR[1]; n++) {
      f1.push({v:draws.filter(d=>{const x=d[CFG.eK];return Array.isArray(x)?x.includes(n):x===n}).length, t:'n'})
      f2.push({v:miss(draws, d=>{const x=d[CFG.eK];return Array.isArray(x)?x.includes(n):x===n}), t:'n'})
    }
    f1.push({v:'',t:'t'},{v:'',t:'t'},{v:'',t:'t'},{v:'',t:'t'})
    f2.push({v:'',t:'t'},{v:'',t:'t'},{v:'',t:'t'},{v:'',t:'t'})

    this.setData({ cols, rows, foot1:f1, foot2:f2, digitLabels:[] })
  },

  // ====== 数字走势（FC3D/PL3/PL5/QXC）======
  buildDigit(code, draws) {
    const DC = {fc3d:3,pl3:3,pl5:5,qxc:7}[code]
    const N = Math.min(draws.length, 200)
    const allLabels = {fc3d:['百位','十位','个位'],pl3:['百位','十位','个位'],pl5:['万位','千位','百位','十位','个位'],qxc:['第1位','第2位','第3位','第4位','第5位','第6位','第7位']}
    this.setData({digitLabels: []})

    const cols = []
    cols.push({w:90, text:'期号', cls:'h'})
    for (let p=0; p<DC; p++) {
      cols.push({w:6, text:allLabels[code][p], cls:'s', span:10})
      for (let d=9; d>=0; d--) cols.push({w:36, text:String(d), cls:'d'})
    }

    const rows = []
    for (let i=0; i<N; i++) {
      const dd = draws[i], ns = dd.numbers||[]
      const r = [{v:sp(dd.period), t:'p'}]
      for (let p=0; p<DC; p++) {
        r.push({v:'', t:'s'})
        for (let v=9; v>=0; v--)
          r.push(ns[p]===v ? {v:v, t:'h'} : {v:miss(draws.slice(i), d=>d.numbers[p]===v), t:'m'})
      }
      rows.push(r)
    }

    const f1=[{v:'出现',t:'f'}], f2=[{v:'遗漏',t:'f'}]
    for (let p=0; p<DC; p++) {
      f1.push({v:'',t:'s'}); f2.push({v:'',t:'s'})
      for (let v=9; v>=0; v--) {
        f1.push({v:draws.filter(d=>d.numbers[p]===v).length, t:'n'})
        f2.push({v:miss(draws, d=>d.numbers[p]===v), t:'n'})
      }
    }

    this.setData({ cols, rows, foot1:f1, foot2:f2 })
  },

  // ====== 快乐8 ======
  buildKL8(draws) {
    const N = Math.min(draws.length, 200)
    const cols = [{w:80, text:'期号', cls:'h'}]
    for (let n=1; n<=80; n++) cols.push({w:34, text:pad(n), cls:'k'})

    const rows = []
    for (let i=0; i<N; i++) {
      const d = draws[i]
      const r = [{v:sp(d.period), t:'p'}]
      for (let n=1; n<=80; n++)
        r.push(d.numbers.includes(n) ? {v:n, t:'h'} : {v:miss(draws.slice(i), dd=>dd.numbers.includes(n)), t:'m'})
      rows.push(r)
    }

    const f1=[{v:'出现',t:'f'}], f2=[{v:'遗漏',t:'f'}]
    for (let n=1; n<=80; n++) {
      f1.push({v:draws.filter(d=>d.numbers.includes(n)).length, t:'n'})
      f2.push({v:miss(draws, d=>d.numbers.includes(n)), t:'n'})
    }

    this.setData({ cols, rows, foot1:f1, foot2:f2, digitLabels:[] })
  },

  // ====== 弹窗 ======
  randomPick(e) {
    const isW = e.currentTarget.dataset.type === 'welfare'
    const pk = [isW?'ssq':'dlt', isW?'fc3d':'pl3'][Math.floor(Math.random()*2)]
    let ti='', ns=[], bc='ball-red'
    if (pk==='ssq'){ti='双色球机选';ns=[...shuffle(r(1,33)).slice(0,6).sort((a,b)=>a-b),rand(1,16)]}
    else if (pk==='fc3d'){ti='福彩3D机选';for(let i=0;i<3;i++)ns.push(rand(0,9));bc='ball-yellow'}
    else if (pk==='dlt'){ti='大乐透机选';ns=[...shuffle(r(1,35)).slice(0,5).sort((a,b)=>a-b),...shuffle(r(1,12)).slice(0,2).sort((a,b)=>a-b)]}
    else{ti='排列三机选';for(let i=0;i<3;i++)ns.push(rand(0,9));bc='ball-purple'}
    this.setData({showPick:true,pickTitle:ti,pickNums:ns,pickCls:bc})
  },
  hidePick(){this.setData({showPick:false})},
  againPick(){this.hidePick();setTimeout(()=>this.randomPick({currentTarget:{dataset:{type:Math.random()>.5?'welfare':'sports'}}}),100)},
  showUniversal(){this.setData({showUniversal:true})},
  hideUniversal(){this.setData({showUniversal:false})},
  useCode(e){const c=e.currentTarget.dataset.code;wx.setClipboardData({data:c.name+': '+c.nums});wx.showToast({title:'已复制',icon:'none'})},
})

function pad(n){return String(n).padStart(2,'0')}
function sp(p){return p&&p.length>6?p.slice(-5):(p||'')}
function miss(ds, fn){for(let i=0;i<ds.length;i++)if(fn(ds[i]))return i;return ds.length}
function r(a,b){const r=[];for(let i=a;i<=b;i++)r.push(i);return r}
function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
