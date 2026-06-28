#!/usr/bin/env python3
"""
本地数据同步脚本 - 从官网拉取最新数据，推送到服务器
用法: python local_sync.py [server_url]
定时任务: 每小时执行一次

数据源:
  - 福彩 (ssq, fc3d, qlc, kl8): cwl.gov.cn API (不带 systemType=PC)
  - 体彩 (dlt, pl3, pl5, qxc): sporttery.cn API (list + lastPoolDraw 回退)
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

CWL_API_MAP = {
    'ssq':  'ssq',
    'fc3d': '3d',    # 福彩3D 在 CWL API 中名为 '3d'
    'qlc':  'qlc',
    'kl8':  'kl8',
}

TC_GAMENO_MAP = {
    'dlt': '85',
    'pl3': '35',    # 排列三 gameNo=35，lotteryDrawResult 为 3 位
    'qxc': '04',
}
# pl5 共用 pl3 的 API（gameNo=35），使用 lotteryUnsortDrawresult（5 位）
TC_PL5_FROM_PL3 = True

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'


def new_session():
    s = requests.Session()
    s.headers.update({
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    return s


def fetch_cwl(code, count=100):
    """从福彩官网获取数据"""
    name = CWL_API_MAP.get(code)
    if not name:
        return []

    s = new_session()
    referer = f'https://www.cwl.gov.cn/ygkj/wqkjgg/{name}/'
    # 注意：不传 systemType=PC，否则返回 404
    api_url = f'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name={name}&issueCount={count}'

    try:
        # 先访问彩种页面获取 Cookie
        s.get('https://www.cwl.gov.cn/', timeout=15)

        resp = s.get(api_url, timeout=15, headers={'Referer': referer})
        resp.raise_for_status()
        data = resp.json()

        if data.get('state') != 0 or not data.get('result'):
            print(f'  [CWL:{code}] API 异常: {data.get("message", "unknown")}')
            return []

        results = []
        for item in data['result'][:count]:
            entry = {
                'period': item['code'],
                'date': (item.get('date', '') or '').split('(')[0].strip(),
            }
            if code == 'ssq':
                entry['reds'] = [int(x) for x in (item.get('red') or '').split(',') if x.strip().isdigit()]
                blue = item.get('blue')
                entry['blue'] = int(blue) if blue and str(blue).isdigit() else 0
            elif code == 'qlc':
                # QLC: 7 个基本号 + 1 个特别号
                all_nums = [int(x) for x in (item.get('red') or '').split(',') if x.strip().isdigit()]
                blue = item.get('blue')
                entry['numbers'] = all_nums
                entry['special'] = int(blue) if blue and str(blue).isdigit() else 0
            elif code in ('fc3d', 'kl8'):
                entry['numbers'] = [int(x) for x in (item.get('red') or '').split(',') if x.strip().isdigit()]
            results.append(entry)

        print(f'  [CWL:{code}] {len(results)} 期, 最新: {results[0]["period"] if results else "N/A"}')
        return results

    except Exception as e:
        print(f'  [CWL:{code}] 错误: {e}')
        return []


def _parse_tc_numbers(result_str):
    """解析体彩号码字符串为数字列表"""
    return [int(p) for p in result_str.replace(',', ' ').replace('\uff0c', ' ').split() if p.isdigit()]


def fetch_tc(code, count=100):
    """从体彩官网获取数据
    对于 pl3 (gameNo=35)，同时提取 pl5 数据（lotteryUnsortDrawresult 字段）
    返回: dict {'pl3': [...], 'pl5': [...]} 当 code='pl3' 时，否则返回 list
    """
    game_no = TC_GAMENO_MAP.get(code)
    if not game_no:
        return []

    s = new_session()
    url = f'https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo={game_no}&provinceId=0&pageSize={count}&isVerify=1&pageNo=1'

    try:
        # 先访问首页获取 Cookie
        s.get('https://www.lottery.gov.cn/', timeout=15)
        resp = s.get(url, timeout=15, headers={'Referer': 'https://www.lottery.gov.cn/kj/kjlb.html'})
        resp.raise_for_status()
        data = resp.json()

        if not data.get('success'):
            print(f'  [TC:{code}] API 返回失败: {data.get("errorMessage", "unknown")}')
            return {'pl3': [], 'pl5': []} if code == 'pl3' else []

        value = data.get('value', {})
        draw_list = value.get('list', []) or value.get('pageList', [])

        # 如果 list 为空，尝试用 lastPoolDraw 获取最新一期
        if not draw_list and value.get('lastPoolDraw'):
            item = value['lastPoolDraw']
            if item.get('lotteryDrawNum'):
                draw_list = [item]
                print(f'  [TC:{code}] list 为空，使用 lastPoolDraw 回退')

        pl3_results = []
        pl5_results = []

        for item in draw_list[:count]:
            period = item.get('lotteryDrawNum', '')
            date = (item.get('lotteryDrawTime') or '').split(' ')[0]
            if not period:
                continue

            result_str = (item.get('lotteryDrawResult') or '').strip()
            unsorted_str = (item.get('lotteryUnsortDrawresult') or '').strip()

            if code == 'dlt':
                parts = _parse_tc_numbers(result_str)
                pl3_results.append({
                    'period': period, 'date': date,
                    'front': parts[:5], 'back': parts[5:7],
                })
            elif code == 'pl3':
                # pl3: lotteryDrawResult 为 3 位
                pl3_results.append({
                    'period': period, 'date': date,
                    'numbers': _parse_tc_numbers(result_str),
                })
                # pl5: lotteryUnsortDrawresult 为 5 位
                pl5_results.append({
                    'period': period, 'date': date,
                    'numbers': _parse_tc_numbers(unsorted_str),
                })
            else:  # qxc
                pl3_results.append({
                    'period': period, 'date': date,
                    'numbers': _parse_tc_numbers(result_str),
                })

        if code == 'pl3':
            print(f'  [TC:pl3] {len(pl3_results)} 期, 最新: {pl3_results[0]["period"] if pl3_results else "N/A"}')
            print(f'  [TC:pl5] {len(pl5_results)} 期, 最新: {pl5_results[0]["period"] if pl5_results else "N/A"}')
            return {'pl3': pl3_results, 'pl5': pl5_results}
        else:
            print(f'  [TC:{code}] {len(pl3_results)} 期, 最新: {pl3_results[0]["period"] if pl3_results else "N/A"}')
            return pl3_results

    except Exception as e:
        print(f'  [TC:{code}] 错误: {e}')
        return {'pl3': [], 'pl5': []} if code == 'pl3' else []


def push_to_server(all_data):
    """推送数据到服务器"""
    s = new_session()
    url = f'{SERVER_URL}/api/lottery/import'
    payload = {'token': IMPORT_TOKEN, 'data': all_data}

    try:
        resp = s.post(url, json=payload, timeout=30)
        result = resp.json()

        if result.get('success'):
            added = result.get('totalAdded', 0)
            results = result.get('results', [])
            print(f'\n=== 推送结果 ===')
            print(f'新增总计: {added} 期')
            for r in results:
                status = f'+{r["added"]} 期' if r['added'] > 0 else '无新数据'
                print(f'  {r["code"]}: {status} (总计 {r["total"]})')
            return True
        else:
            print(f'推送失败: {result.get("error", "unknown")}')
            return False
    except Exception as e:
        print(f'推送错误: {e}')
        return False


def main():
    print(f'=== 彩票数据同步 ===')
    print(f'时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'服务器: {SERVER_URL}')
    print()

    all_data = {}

    print('--- 福彩数据 (CWL) ---')
    for code in CWL_API_MAP:
        all_data[code] = fetch_cwl(code, 100)
        time.sleep(1)

    print('\n--- 体彩数据 (TC) ---')
    for code in TC_GAMENO_MAP:
        result = fetch_tc(code, 100)
        if code == 'pl3' and isinstance(result, dict):
            # pl3 同时返回 pl5 数据
            all_data['pl3'] = result['pl3']
            all_data['pl5'] = result['pl5']
        else:
            all_data[code] = result
        time.sleep(1)

    # 保存数据到本地文件（GitHub Actions 会提交此文件到仓库）
    data_file = os.path.join(os.path.dirname(__file__), 'data', 'lottery-data.json')
    os.makedirs(os.path.dirname(data_file), exist_ok=True)
    with open(data_file, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False)
    print(f'\n数据已保存到本地: {data_file}')

    # 尝试推送到服务器（可能失败，不影响本地保存）
    print(f'\n--- 尝试推送到服务器 ---')
    push_to_server(all_data)

    print(f'\n=== 同步完成 ===')
    print(f'时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
