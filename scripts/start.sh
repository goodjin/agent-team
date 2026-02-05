#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/.daemon.pid"
LOG_FILE="$PROJECT_DIR/.daemon.log"
MAX_WAIT=10

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Daemon is already running with PID: $PID"
        exit 0
    else
        rm -f "$PID_FILE"
    fi
fi

echo "Building project..."
cd "$PROJECT_DIR"
npm run build

if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

if [ ! -f "$PROJECT_DIR/dist/index.js" ]; then
    echo "Error: dist/index.js not found after build"
    exit 1
fi

echo "Starting daemon..."
cd "$PROJECT_DIR"

nohup node dist/index.js > "$LOG_FILE" 2>&1 &
DAEMON_PID=$!

echo "$DAEMON_PID" > "$PID_FILE"
echo "Daemon started with PID: $DAEMON_PID"

WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if kill -0 "$DAEMON_PID" 2>/dev/null; then
        echo "Daemon is running successfully"
        exit 0
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

echo "Warning: Daemon may not have started properly"
exit 1
