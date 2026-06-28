@echo off
REM 彩票数据定时同步任务
REM 直接通过公网 API 推送数据（Nginx 反向代理 80 端口）
REM 每天 21:00 和 22:00 各执行一次

cd /d "I:\lottery-miniapp\server"
python local_sync.py >> "I:\lottery-miniapp\server\sync_log.txt" 2>&1
