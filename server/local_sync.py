#!/usr/bin/env python3
"""
彩票数据同步脚本 - 从 huiniao.top 免费API获取最新数据
用法: python local_sync.py [server_url]
可以在服务器直接运行（不会被封IP）
"""

import requests
import json
import sys
import time
import os
from datetime import datetime

# ============ 服务器配置 ============

SERVER_URL = 'https://www.592302.eu.cc'
IMPORT_TOKEN = os.environ.get('LOTTERY_IMPORT_TOKEN', 'lottery2026')

if len(sys.argv) > 1 and sys.argv[1].startswith('http'):
    SERVER_URL = sys.argv[1]

# ============ 数据源配置 ============
# 使用 huiniao.top 免费API（无需注册，无需key）
# https://api.huiniao.top/interface/home/lotteryHistory?type=TYPE&page=1&limit=N

HUINIAO_TYPES = {
    'ssq':  'ssq',   # 双色球
    'fc3d': 'fcsd',  # 福彩3D
    'qlc':  'qlc',   # 七乐彩
    'kl8':  'klb',   # 快乐8
    'dlt':  'dlt',   # 大乐透
    'pl3':  'pls',   # 排列三
    'pl5':  'plw',   # 排列五
    'qxc':  'qxc',   # 七星彩
}

API_BASE = 'http://api.huiniao.top/interface/home/lotteryHistory'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

def new_session():
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Accept': 'application/json'})
    return s

def fetch_huiniao(code, full=False):
    """从 huiniao.top 获取彩票数据
    full=True: 翻页获取全部历史（首次使用）
    full=False: 只取最新5期（后续增量更新，服务器自动去重）
    """
    huiniao_type = HUINIAO_TYPES.get(code)
    if not huiniao_type:
        return []

    s = new_session()
    limit = 200 if full else 5
    url = f'{API_BASE}?type={huiniao_type}&page=1&limit={limit}'

    try:
        resp = s.get(url, timeout=15)
        data = resp.json()

        if data.get('code') != 1:
            print(f'  [{code}] API 返回失败: {data.get("info", "unknown")}')
            return []

        result = data.get('data', {})
        total_pages = result.get('data', {}).get('totalPage', 1)

        # 先取第一页（最新200期）
        items = result.get('data', {}).get('list', [])

        # 首次全量拉取才翻页
        if full and total_pages > 1:
            print(f'  [{code}] 全量拉取 1/{total_pages}...')
            for page in range(2, total_pages + 1):
                time.sleep(2)
                try:
                    r2 = new_session().get(f'{API_BASE}?type={huiniao_type}&page={page}&limit=200', timeout=15)
                    d2 = r2.json()
                    items.extend(d2.get('data', {}).get('data', {}).get('list', []))
                except:
                    pass
                if page % 5 == 0:
                    print(f'  [{code}] 全量拉取 {page}/{total_pages}...')
        else:
            print(f'  [{code}] 增量更新（最新5期）')

        last = result.get('last', {})
        if not items and last:
            items = [last]

        results = []
        for item in items:
            entry = {
                'period': item.get('code', ''),
                'date': item.get('day', ''),
            }
            if not entry['period']:
                continue

            # 提取号码（huiniao 返回 one~twenty 字段，快乐8有20个）
            nums = []
            all_fields = ['one', 'two', 'three', 'four', 'five', 'six', 'seven',
                          'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
                          'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
            for k in all_fields:
                v = item.get(k)
                if v is not None and str(v).isdigit():
                    nums.append(int(v))

            if code == 'ssq':
                if len(nums) >= 7:
                    entry['reds'] = nums[:6]
                    entry['blue'] = nums[6]
                else:
                    print(f'  [{code}] 号码不足: {nums}')
                    continue
            elif code == 'qlc':
                if len(nums) >= 7:
                    entry['numbers'] = nums[:7]
                    entry['special'] = nums[7] if len(nums) > 7 else 0
                else:
                    # 偶尔只有7个基本号没有特别号
                    entry['numbers'] = nums
                    entry['special'] = 0
            elif code == 'dlt':
                if len(nums) >= 7:
                    entry['front'] = nums[:5]
                    entry['back'] = nums[5:7]
                else:
                    print(f'  [{code}] 号码不足: {nums}')
                    continue
            elif code == 'kl8':
                entry['numbers'] = nums
            elif code in ('fc3d', 'pl3'):
                entry['numbers'] = nums[:3]
            elif code == 'pl5':
                entry['numbers'] = nums[:5]
            elif code == 'qxc':
                entry['numbers'] = nums[:7]
            else:
                entry['numbers'] = nums

            results.append(entry)

        print(f'  [{code}] {len(results)} 期, 最新: {results[0]["period"]} ({results[0]["date"]})')
        return results

    except Exception as e:
        print(f'  [{code}] 错误: {e}')
        return []

def push_to_server(all_data):
    """推送数据到服务器"""
    s = new_session()
    url = f'{SERVER_URL}/api/lottery/import'
    payload = {'token': IMPORT_TOKEN, 'data': all_data}

    try:
        resp = s.post(url, json=payload, timeout=30)
        if resp.status_code == 200:
            result = resp.json()
            if result.get('success'):
                print(f'\n=== 推送结果 ===')
                print(f'新增总计: {result["totalAdded"]} 期')
                for r in result['results']:
                    print(f'  {r["code"]}: +{r["added"]} 期 (总计 {r["total"]})')
                return True
            else:
                print(f'推送失败: {result.get("error", "unknown")}')
                return False
        else:
            print(f'推送失败: HTTP {resp.status_code}')
            return False
    except Exception as e:
        print(f'推送错误: {e}')
        return False

def main():
    print(f'=== 彩票数据同步 ===')
    print(f'时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'数据源: huiniao.top')
    print(f'服务器: {SERVER_URL}')
    print()

    all_data = {}

    # 判断是否首次全量拉取：本地数据文件不存在或为空
    data_file = os.path.join(os.path.dirname(__file__), 'data', 'lottery-data.json')
    is_full = not (os.path.exists(data_file) and os.path.getsize(data_file) > 1000)

    print(f'同步模式: {"全量拉取（首次）" if is_full else "增量拉取（每日更新）"}')
    print()

    for code in HUINIAO_TYPES:
        all_data[code] = fetch_huiniao(code, full=is_full)
        time.sleep(5)  # 防限流

    # 保存本地（GitHub Actions 用）
    data_file = os.path.join(os.path.dirname(__file__), 'data', 'lottery-data.json')
    os.makedirs(os.path.dirname(data_file), exist_ok=True)
    with open(data_file, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False)
    print(f'\n数据已保存到本地')

    # 推送到服务器
    print(f'\n--- 推送到服务器 ---')
    push_to_server(all_data)

    print(f'\n=== 同步完成 ===')
    print(f'时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
