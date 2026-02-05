#!/bin/bash

# Agent Team Server Startup Script
# 输出日志到文件，方便排查问题

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$HOME/.agent-team/logs"

# 创建日志目录
mkdir -p "$LOG_DIR"

# 日志文件名：server-YYYYMMDD-HHMMSS.log
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/server-$TIMESTAMP.log"

# 输出启动信息
echo "========================================"
echo "Agent Team Server Startup"
echo "========================================"
echo "Time: $(date)"
echo "Log file: $LOG_FILE"
echo "========================================"
echo ""
echo "To view logs in real-time (with timestamp):"
echo "  tail -f $LOG_FILE"
echo ""
echo "To check for errors:"
echo "  grep -i error $LOG_FILE"
echo ""
echo "To see latest 50 lines:"
echo "  tail -50 $LOG_FILE"
echo ""
echo "========================================"
echo ""

# 切换到项目目录
cd "$PROJECT_DIR"

# 检查配置
echo "Checking configuration..."
if [ -f "$HOME/.agent-team/config.yaml" ]; then
    echo "✓ Config found: $HOME/.agent-team/config.yaml"

    # 检查智谱配置
    if grep -q "zhipu-primary" "$HOME/.agent-team/config.yaml"; then
        echo "✓ zhipu-primary provider found in config"
        API_KEY=$(grep -A 5 "zhipu-primary:" "$HOME/.agent-team/config.yaml" | grep "apiKey:" | head -1)
        if [[ "$API_KEY" == *"1bf5db7c25"* ]]; then
            echo "✓ zhipu API key is configured"
        else
            echo "⚠️  zhipu API key may not be configured correctly"
            echo "   Found: $API_KEY"
        fi
    fi
else
    echo "✗ Config NOT found: $HOME/.agent-team/config.yaml"
fi

echo ""
echo "Starting server..."
echo "========================================"
echo ""

# 使用 tsx 运行，添加时间戳前缀到日志
exec npx tsx src/server/index.ts 2>&1 | while IFS= read -r line; do
    echo "[$(date '+%H:%M:%S')] $line" | tee -a "$LOG_FILE"
done
