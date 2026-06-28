App({
  globalData: {
    // 从首页跳转走势图的待处理代码
    pendingTrendCode: '',
    // 福彩彩票数据
    welfareLotteries: [
      { code: 'ssq', name: '双色球', logoType: 'ssq', schedule: '每周二、四、日开奖' },
      { code: 'fc3d', name: '福彩3D', logoType: 'fc3d', schedule: '每天开奖' },
      { code: 'qlc', name: '七乐彩', logoType: 'qlc', schedule: '每周一、三、五开奖' },
      { code: 'kl8', name: '快乐8', logoType: 'kl8', schedule: '每天开奖' }
    ],
    // 体彩彩票数据
    sportsLotteries: [
      { code: 'dlt', name: '大乐透', logoType: 'dlt', schedule: '每周一、三、六开奖' },
      { code: 'pl3', name: '排列三', logoType: 'pl3', schedule: '每天开奖' },
      { code: 'pl5', name: '排列五', logoType: 'pl5', schedule: '每天开奖' },
      { code: 'qxc', name: '七星彩', logoType: 'qxc', schedule: '每周二、五、日开奖' }
    ],
    // 所有彩票（用于走势图和遗漏查询）
    allLotteries: [
      { code: 'fc3d', name: '福彩3D' },
      { code: 'pl3', name: '排列三' },
      { code: 'pl5', name: '排列五' },
      { code: 'ssq', name: '双色球' },
      { code: 'kl8', name: '快乐8' },
      { code: 'qlc', name: '七乐彩' },
      { code: 'dlt', name: '大乐透' },
      { code: 'qxc', name: '七星彩' }
    ]
  },

  onLaunch() {
    // 小程序启动时初始化数据
  }
})
