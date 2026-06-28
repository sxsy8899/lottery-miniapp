#!/usr/bin/env python3
"""
彩票数据服务 - 服务器部署脚本
通过 SSH 连接服务器，自动部署和配置
"""

import paramiko
import os
import sys
import io
import time
import json

# 服务器信息
HOST = '132.145.125.79'
PORT = 22
USER = 'root'
PASSWORD = 'wxy810328'

# 项目路径
LOCAL_SERVER_DIR = r'I:\lottery-miniapp\server'
REMOTE_DIR = '/opt/lottery-server'

# 需要上传的文件（相对路径）
UPLOAD_FILES = [
    'index.js',
    'sync.js',
    'package.json',
    'data/lottery-data.json',
]


def ssh_connect():
    """连接服务器"""
    print(f'连接服务器 {HOST}:{PORT} ...')
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    print('✓ SSH 连接成功')
    return client


def run_cmd(client, cmd, timeout=120):
    """执行远程命令，返回 stdout"""
    print(f'$ {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    exit_code = stdout.channel.recv_exit_status()
    if out:
        print(f'  {out}')
    if err:
        print(f'  [stderr] {err}')
    if exit_code != 0:
        print(f'  [exit: {exit_code}]')
    return out, err, exit_code


def upload_file(sftp, local_path, remote_path):
    """上传单个文件"""
    print(f'  上传: {os.path.basename(local_path)} -> {remote_path}')
    sftp.put(local_path, remote_path)


def deploy():
    client = ssh_connect()
    sftp = client.open_sftp()

    # ============ 1. 检查环境 ============
    print('\n=== 检查服务器环境 ===')
    out, _, _ = run_cmd(client, 'uname -m')
    out, _, _ = run_cmd(client, 'cat /etc/os-release | head -3')
    out, _, _ = run_cmd(client, 'free -h | head -2')
    out, _, _ = run_cmd(client, 'df -h / | tail -1')

    # 检查 Node.js
    out, _, code = run_cmd(client, 'node -v 2>/dev/null')
    node_installed = code == 0
    out, _, code = run_cmd(client, 'npm -v 2>/dev/null')
    npm_installed = code == 0

    # ============ 2. 安装 Node.js（如需要）============
    if not node_installed:
        print('\n=== 安装 Node.js ===')
        run_cmd(client, 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -', timeout=120)
        run_cmd(client, 'apt-get install -y nodejs', timeout=120)
        run_cmd(client, 'node -v')
        run_cmd(client, 'npm -v')
    else:
        print(f'  Node.js 已安装')

    # 安装 PM2
    out, _, code = run_cmd(client, 'pm2 -v 2>/dev/null')
    if code != 0:
        print('\n=== 安装 PM2 ===')
        run_cmd(client, 'npm install -g pm2', timeout=60)
    else:
        print(f'  PM2 已安装')

    # ============ 3. 创建项目目录 ============
    print(f'\n=== 创建项目目录 {REMOTE_DIR} ===')
    run_cmd(client, f'mkdir -p {REMOTE_DIR}/data')

    # ============ 4. 上传文件 ============
    print('\n=== 上传文件 ===')
    for f in UPLOAD_FILES:
        local_path = os.path.join(LOCAL_SERVER_DIR, f.replace('/', os.sep))
        remote_path = f'{REMOTE_DIR}/{f}'
        # 确保远程目录存在
        remote_dir = os.path.dirname(remote_path)
        try:
            sftp.stat(remote_dir)
        except:
            run_cmd(client, f'mkdir -p {remote_dir}')
        upload_file(sftp, local_path, remote_path)

    print('✓ 所有文件上传完成')

    # ============ 5. 安装依赖 ============
    print('\n=== 安装 npm 依赖 ===')
    run_cmd(client, f'cd {REMOTE_DIR} && npm install --production', timeout=120)
    print('✓ 依赖安装完成')

    # ============ 6. 停止旧服务（如有）============
    print('\n=== 停止旧服务 ===')
    run_cmd(client, 'pm2 delete lottery-server 2>/dev/null; true')

    # ============ 7. 启动服务 ============
    print('\n=== 启动服务 ===')
    run_cmd(client, f'cd {REMOTE_DIR} && pm2 start index.js --name lottery-server --node-args="--max-old-space-size=256"')
    run_cmd(client, 'pm2 save')

    # ============ 8. 设置 PM2 开机自启 ============
    print('\n=== 配置 PM2 开机自启 ===')
    out, err, code = run_cmd(client, 'pm2 startup 2>&1 | tail -3')
    # 尝试自动执行 startup 命令
    run_cmd(client, 'systemctl enable pm2-root 2>/dev/null; true')

    # ============ 9. 测试服务 ============
    print('\n=== 测试服务 ===')
    time.sleep(3)
    run_cmd(client, 'curl -s http://localhost:3000/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/health')

    # ============ 10. 配置定时同步 ============
    print('\n=== 配置定时同步（cron）===')
    # 每小时同步一次
    cron_line = f'0 * * * * cd {REMOTE_DIR} && /usr/bin/node sync.js >> {REMOTE_DIR}/sync.log 2>&1'
    # 读取现有 crontab
    out, _, _ = run_cmd(client, 'crontab -l 2>/dev/null')
    existing_cron = out if out else ''

    # 移除旧的 lottery sync 条目
    cron_lines = [l for l in existing_cron.split('\n') if l.strip() and 'lottery' not in l.lower() and 'sync.js' not in l]
    cron_lines.append(cron_line)
    new_cron = '\n'.join(cron_lines)

    # 写入新 crontab
    run_cmd(client, f'echo "{new_cron}" | crontab -')
    run_cmd(client, 'crontab -l')
    print('✓ 定时同步已配置（每小时整点执行）')

    # ============ 11. 配置防火墙 ============
    print('\n=== 配置防火墙 ===')
    run_cmd(client, 'iptables -C INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 3000 -j ACCEPT', timeout=10)
    run_cmd(client, 'which ufw && ufw allow 3000/tcp 2>/dev/null; true', timeout=10)
    print('✓ 端口 3000 已开放')

    # ============ 完成 ============
    print('\n=== 部署完成 ===')
    print(f'服务地址: http://{HOST}:3000')
    print(f'健康检查: http://{HOST}:3000/health')
    print(f'API 文档: http://{HOST}:3000/api/lottery/all-latest')
    print(f'定时同步: 每小时整点自动执行')
    print(f'日志查看: pm2 logs lottery-server')
    print(f'同步日志: tail -f {REMOTE_DIR}/sync.log')

    sftp.close()
    client.close()
    return True


if __name__ == '__main__':
    try:
        deploy()
    except Exception as e:
        print(f'\n❌ 部署失败: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
