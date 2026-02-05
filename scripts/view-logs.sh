#!/bin/bash

# Agent Team Log Viewer
# 查看最新的服务器日志

LOG_DIR="$HOME/.agent-team/logs"

if [ ! -d "$LOG_DIR" ]; then
    echo "No logs found at $LOG_DIR"
    exit 1
fi

# 获取最新的日志文件
LATEST_LOG=$(ls -t "$LOG_DIR"/server-*.log 2>/dev/null | head -1)

if [ -z "$LATEST_LOG" ]; then
    echo "No log files found"
    exit 1
fi

echo "========================================"
echo "Latest log: $LATEST_LOG"
echo "========================================"
echo ""

# 实时监控日志（Ctrl+C 退出）
if [ "$1" = "-f" ]; then
    tail -f "$LATEST_LOG"
else
    # 显示最后 100 行
    tail -100 "$LATEST_LOG"
fi
