#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Restarting daemon..."

"$SCRIPT_DIR/stop.sh"
sleep 2

"$SCRIPT_DIR/start.sh"
exit $?
