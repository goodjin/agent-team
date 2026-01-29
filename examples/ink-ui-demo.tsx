/**
 * Ink UI 演示示例
 * 展示如何使用基于 Ink 的现代化 CLI 界面
 */

import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { ProjectAgent } from '../src/core/project-agent.js';
import { config } from 'dotenv';

config();

/**
 * 简单的聊天界面演示
 */
const ChatDemo = () => {
  const [messages, setMessages] = React.useState<Array<{
    role: string;
    content: string;
  }>>([
    { role: 'system', content: '欢迎使用 Agent Team - Ink UI 演示' },
  ]);
  const [input, setInput] = React.useState('');
  const { exit } = useApp();

  useInput((inputKey, key) => {
    if (key.return && input.trim()) {
      setMessages(prev => [...prev, {
        role: 'user',
        content: input,
      }]);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `你说了: ${input}`,
      }]);
      setInput('');
    } else if (key.escape || (key.ctrl && inputKey === 'c')) {
      exit();
    } else if (inputKey && !key.ctrl && !key.meta) {
      setInput(prev => prev + inputKey);
    } else if (key.backspace) {
      setInput(prev => prev.slice(0, -1));
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      {/* 标题 */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>
          🚀 Agent Team - Ink UI Demo
        </Text>
      </Box>

      {/* 消息区域 */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        {messages.map((msg, idx) => (
          <Box key={idx} marginBottom={1}>
            <Text color={msg.role === 'user' ? 'cyan' : msg.role === 'assistant' ? 'green' : 'gray'}>
              [{msg.role}]: {msg.content}
            </Text>
          </Box>
        ))}
      </Box>

      {/* 输入区域 */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan">You: </Text>
        <Text>{input}</Text>
        <Text color="gray" dimColor>█</Text>
      </Box>

      {/* 帮助 */}
      <Box paddingX={1} paddingY={0}>
        <Text color="gray" dimColor>
          输入消息后按 Enter | Esc 或 Ctrl+C 退出
        </Text>
      </Box>
    </Box>
  );
};

/**
 * 主函数
 */
async function main() {
  console.log('启动 Ink UI 演示...\n');

  render(<ChatDemo />);
}

main().catch(console.error);
