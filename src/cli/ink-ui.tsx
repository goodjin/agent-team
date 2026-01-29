/**
 * 基于 Ink 的现代化 CLI UI
 * 使用 React 组件化开发，提供类似 Claude Code 的交互体验
 */

import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useInput, useApp, Static } from 'ink';
import type { Key } from 'ink';
import type { ProjectAgent } from '../core/project-agent.js';

export interface InkUIOptions {
  agent: ProjectAgent;
  onExit?: () => void;
}

/**
 * 主聊天界面组件
 */
const ChatInterface: React.FC<{
  agent: ProjectAgent;
  onExit: () => void;
}> = ({ agent, onExit }) => {
  const [messages, setMessages] = useState<Array<{
    role: string;
    content: string;
    timestamp: Date;
  }>>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [inputHistory] = useState<string[]>([]);

  const { exit } = useApp();

  // 处理用户输入
  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isProcessing) return;

    const userInput = input.trim();
    
    // 添加到历史记录
    inputHistory.push(userInput);
    setHistoryIndex(-1);

    // 添加用户消息
    setMessages(prev => [...prev, {
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    }]);

    setInput('');
    setIsProcessing(true);

    try {
      // 调用 AI Agent
      // 这里需要根据实际的 agent API 调整
      const response = 'AI 响应示例'; // await agent.chat(userInput);
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `错误: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, inputHistory]);

  // 处理键盘输入
  useInput((inputKey: string, key: Key) => {
    if (key.return) {
      handleSubmit();
    } else if (key.escape) {
      onExit();
    } else if (key.upArrow && inputHistory.length > 0) {
      if (historyIndex < 0) {
        setHistoryIndex(inputHistory.length - 1);
      } else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
      }
      setInput(inputHistory[historyIndex] || '');
    } else if (key.downArrow && historyIndex >= 0) {
      if (historyIndex < inputHistory.length - 1) {
        setHistoryIndex(historyIndex + 1);
        setInput(inputHistory[historyIndex + 1] || '');
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
    } else if (key.ctrl && inputKey === 'c') {
      exit();
    }
  });

  // 获取角色颜色
  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      user: 'cyan',
      assistant: 'green',
      system: 'gray',
      'product-manager': 'blue',
      architect: 'magenta',
      developer: 'yellow',
      tester: 'red',
      'doc-writer': 'cyan',
    };
    return colors[role] || 'white';
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* 消息区域 */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Static items={messages}>
          {(message: { role: string; content: string; timestamp: Date }) => (
            <Box key={`${message.timestamp.getTime()}-${message.role}`} marginBottom={1}>
              <Box>
                <Text color={getRoleColor(message.role)} bold>
                  [{message.role}]
                </Text>
                <Text color="gray" dimColor>
                  {' '}
                  {message.timestamp.toLocaleTimeString()}
                </Text>
              </Box>
              <Box marginLeft={2}>
                <Text>{message.content}</Text>
              </Box>
            </Box>
          )}
        </Static>

        {/* 处理中指示器 */}
        {isProcessing && (
          <Box>
            <Text color="yellow">⏳ 处理中...</Text>
          </Box>
        )}
      </Box>

      {/* 输入区域 */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} paddingY={0}>
        <Box>
          <Text color="cyan" bold>You: </Text>
          <Text>{input}</Text>
          <Text color="gray" dimColor>█</Text>
        </Box>
      </Box>

      {/* 帮助提示 */}
      <Box paddingX={1} paddingY={0}>
        <Text color="gray" dimColor>
          按 Enter 发送 | Esc 退出 | ↑↓ 历史记录
        </Text>
      </Box>
    </Box>
  );
};

/**
 * 启动基于 Ink 的 UI
 */
export function startInkUI(options: InkUIOptions): void {
  const { agent, onExit } = options;

  const App = () => {
    const handleExit = useCallback(() => {
      if (onExit) {
        onExit();
      }
    }, [onExit]);

    return (
      <Box flexDirection="column" height="100%">
        {/* 标题栏 */}
        <Box borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text color="cyan" bold>
            🚀 Agent Team - AI Assistant
          </Text>
        </Box>

        {/* 主内容区 */}
        <Box flexGrow={1}>
          <ChatInterface agent={agent} onExit={handleExit} />
        </Box>
      </Box>
    );
  };

  render(<App />);
}
