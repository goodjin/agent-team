#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/.daemon.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "Daemon is not running (no PID file found)"
    exit 0
fi

PID=$(cat "$PID_FILE")

if ! kill -0 "$PID" 2>/dev/null; then
    echo "Daemon is not running (PID $PID not found)"
    rm -f "$PID_FILE"
    exit 0
fi

echo "Stopping daemon (PID: $PID)..."
kill "$PID"

WAIT_COUNT=0
MAX_WAIT=5
while kill -0 "$PID" 2>/dev/null && [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

if kill -0 "$PID" 2>/dev/null; then
    echo "Daemon did not stop gracefully, forcing..."
    kill -9 "$PID"
    sleep 1
fi

rm -f "$PID_FILE"
echo "Daemon stopped"
exit 0
