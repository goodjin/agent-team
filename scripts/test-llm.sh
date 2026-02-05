#!/bin/bash

# Agent Team LLM Connection Test Script
# 测试 LLM API 连接是否正常

echo "========================================"
echo "LLM Connection Test"
echo "========================================"

# 读取配置中的 API Key 和 Base URL
CONFIG_FILE="$HOME/.agent-team/config.yaml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "✗ Config file not found: $CONFIG_FILE"
    exit 1
fi

echo "Using config: $CONFIG_FILE"
echo ""

# 使用 yq 解析 YAML（如果没有安装，会提示）
ZHIPU_API_KEY=$(grep "zhipu-primary" -A 10 "$CONFIG_FILE" | grep "apiKey:" | head -1 | sed 's/.*apiKey: *//' | tr -d ' ')
ZHIPU_BASE_URL=$(grep "zhipu-primary" -A 10 "$CONFIG_FILE" | grep "baseURL:" | head -1 | sed 's/.*baseURL: *//' | tr -d ' ')

echo "API Key (first 10 chars): ${ZHIPU_API_KEY:0:10}..."
echo "Base URL: $ZHIPU_BASE_URL"
echo ""

if [ -z "$ZHIPU_API_KEY" ]; then
    echo "✗ API Key not found in config"
    exit 1
fi

# 测试 API 调用
echo "Testing API connection..."
echo ""

curl -X POST "$ZHIPU_BASE_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ZHIPU_API_KEY" \
  -d '{
    "model": "glm-4",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello"}
    ],
    "max_tokens": 50
  }' 2>&1 | tee /tmp/llm-test-response.json

echo ""
echo "========================================"
echo "Test completed"
echo "========================================"
