#!/usr/bin/env python3
"""
定时同步包装器 - 自动建立 SSH 隧道，运行同步，关闭隧道
用法: python sync_wrapper.py
可注册为 Windows 计划任务定期执行
"""

import subprocess
import time
import sys
import os
import signal

SSH_KEY = 'D:/ssh-key-2026-06-27.key'
SSH_HOST = 'ubuntu@168.110.59.103'
LOCAL_PORT = 13000
REMOTE_PORT = 3000
SYNC_SCRIPT = os.path.join(os.path.dirname(__file__), 'local_sync.py')


def start_tunnel():
    """启动 SSH 隧道"""
    cmd = [
        'ssh', '-i', SSH_KEY,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=30',
        '-N', '-L', f'{LOCAL_PORT}:localhost:{REMOTE_PORT}',
        SSH_HOST,
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # 等待隧道建立
    time.sleep(3)
    if proc.poll() is not None:
        print('SSH 隧道启动失败')
        return None
    print(f'SSH 隧道已建立: localhost:{LOCAL_PORT} -> {SSH_HOST}:{REMOTE_PORT}')
    return proc


def run_sync():
    """运行同步脚本"""
    server_url = f'http://localhost:{LOCAL_PORT}'
    cmd = [sys.executable, SYNC_SCRIPT, server_url]
    result = subprocess.run(cmd, cwd=os.path.dirname(SYNC_SCRIPT))
    return result.returncode


def main():
    print(f'=== 定时同步任务 ===')
    print(f'时间: {time.strftime("%Y-%m-%d %H:%M:%S")}')

    tunnel = start_tunnel()
    if tunnel is None:
        return 1

    try:
        exit_code = run_sync()
    finally:
        tunnel.terminate()
        tunnel.wait(timeout=5)
        print('SSH 隧道已关闭')

    return exit_code


if __name__ == '__main__':
    sys.exit(main())
