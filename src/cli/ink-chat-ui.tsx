/**
 * 基于 Ink 的现代化聊天界面
 * 提供类似 Claude Code 的交互体验
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { render, Box, Text, useInput, useApp, Static } from 'ink';
import type { ProjectAgent } from '../core/project-agent.js';
import { createIntelligentAgent } from '../ai/index.js';
import { getLogger } from '../utils/logger.js';

export interface InkChatUIOptions {
  agent: ProjectAgent;
  onExit?: () => void;
}

interface Message {
  id: string;
  role: string;
  content: string;
  timestamp: Date;
}

/**
 * Ink 聊天界面组件
 */
const InkChatInterface: React.FC<{
  agent: ProjectAgent;
  onExit: () => void;
}> = ({ agent, onExit }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputHistoryRef = useRef<string[]>([]);
  const { exit } = useApp();
  const aiAgentRef = useRef<ReturnType<typeof createIntelligentAgent> | null>(null);

  // 用于跟踪当前的 assistant 消息 ID
  const currentAssistantMessageIdRef = useRef<string | null>(null);

  // 初始化日志配置 - 禁用控制台输出，只保留文件日志
  useEffect(() => {
    const logger = getLogger({
      logToConsole: false, // 禁用控制台输出，避免干扰 Ink UI
      logToFile: true,     // 保留文件日志
    });
  }, []);

  // 初始化 AI Agent - 使用 useCallback 确保 output 回调能访问最新的 ref
  useEffect(() => {
    const outputCallback = (text: string) => {
      if (!text || text.trim() === '') return;
      
      const logger = getLogger();
      logger.debug('[OUTPUT回调] 收到输出', { textLength: text.length, preview: text.substring(0, 50), currentId: currentAssistantMessageIdRef.current });
      
      // 将输出添加到消息列表
      setMessages(prev => {
        // 如果有当前的 assistant 消息，追加内容
        const currentId = currentAssistantMessageIdRef.current;
        if (currentId) {
          logger.debug('[OUTPUT回调] 更新现有消息', { id: currentId, textLength: text.length });
          const updated = prev.map(msg =>
            msg.id === currentId
              ? { ...msg, content: msg.content + text }
              : msg
          );
          return updated;
        }
        // 否则查找最后一条空的 assistant 消息
        const lastAssistantMsg = [...prev].reverse().find(msg => 
          msg.role === 'assistant' && (!msg.content || msg.content.trim() === '')
        );
        if (lastAssistantMsg) {
          logger.debug('[OUTPUT回调] 更新最后一条空消息', { id: lastAssistantMsg.id, textLength: text.length });
          return prev.map(msg =>
            msg.id === lastAssistantMsg.id
              ? { ...msg, content: msg.content + text }
              : msg
          );
        }
        // 创建新消息
        const newId = `assistant-${Date.now()}`;
        currentAssistantMessageIdRef.current = newId;
        logger.debug('[OUTPUT回调] 创建新消息', { id: newId, textLength: text.length });
        return [
          ...prev,
          {
            id: newId,
            role: 'assistant',
            content: text,
            timestamp: new Date(),
          },
        ];
      });
    };

    aiAgentRef.current = createIntelligentAgent(agent, {
      showThoughts: false,
      autoConfirmTools: false,
      maxHistory: 50,
      maxToolIterations: 10,
      output: outputCallback,
    });
  }, [agent]);

  // 添加初始消息
  useEffect(() => {
    setMessages([
      {
        id: 'init-1',
        role: 'system',
        content: '🚀 Agent Team - AI Assistant',
        timestamp: new Date(),
      },
      {
        id: 'init-2',
        role: 'system',
        content: '输入你的任务或问题，输入 "help" 查看帮助，输入 "exit" 退出',
        timestamp: new Date(),
      },
    ]);
  }, []);

  // 处理命令
  const handleCommand = useCallback(async (command: string): Promise<boolean> => {
    const parts = command.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case 'help':
      case 'h': {
        const helpMessage: Message = {
          id: `help-${Date.now()}`,
          role: 'system',
          content: `可用命令：
/help, /h - 显示帮助
/stats, /s - 查看统计信息
/clear, /c - 清空消息
/exit, /quit, /q - 退出程序`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, helpMessage]);
        return true;
      }

      case 'stats':
      case 's': {
        const stats = agent.getStats();
        const statsMessage: Message = {
          id: `stats-${Date.now()}`,
          role: 'system',
          content: `统计信息：
总任务数: ${stats.tasks.total}
已完成: ${stats.tasks.byStatus.completed}
失败: ${stats.tasks.byStatus.failed}
进行中: ${stats.tasks.byStatus['in-progress']}`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, statsMessage]);
        return true;
      }

      case 'clear':
      case 'c': {
        setMessages([
          {
            id: 'clear-1',
            role: 'system',
            content: '消息已清空',
            timestamp: new Date(),
          },
        ]);
        return true;
      }

      case 'exit':
      case 'quit':
      case 'q': {
        onExit();
        return false;
      }

      default: {
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `未知命令: ${cmd}。输入 /help 查看帮助`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        return true;
      }
    }
  }, [agent, onExit]);

  // 处理用户输入
  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isProcessing) return;

    const userInput = input.trim();
    
    // 检查是否是退出
    if (/^(exit|quit|bye|再见|退出)$/i.test(userInput)) {
      onExit();
      return;
    }

    // 检查是否是命令
    if (userInput.startsWith('/')) {
      const shouldContinue = await handleCommand(userInput);
      if (!shouldContinue) {
        return;
      }
      setInput('');
      return;
    }

    // 检查是否是帮助
    if (/^(help|\?|帮助)$/i.test(userInput)) {
      await handleCommand('/help');
      setInput('');
      return;
    }
    
    // 添加到历史记录
    inputHistoryRef.current.push(userInput);
    setHistoryIndex(-1);

    // 添加用户消息
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    // 创建 assistant 消息 ID
    const assistantMessageId = `assistant-${Date.now()}`;
    
    // 先设置 ref，确保 output 回调能找到这条消息
    currentAssistantMessageIdRef.current = assistantMessageId;
    
    // 添加一个空的 assistant 消息，用于流式输出
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }]);

    try {
      const logger = getLogger();
      logger.info('用户输入', { input: userInput.substring(0, 100) });

      if (aiAgentRef.current) {
        // 调用 AI Agent 处理
        const response = await aiAgentRef.current.chat(userInput);

        logger.debug('AI 响应', { responseLength: response?.length || 0, preview: response?.substring(0, 100) });

        // 等待一小段时间，确保 output 回调已经执行
        await new Promise(resolve => setTimeout(resolve, 200));

        // 强制更新消息内容 - 确保响应一定会显示
        if (response && response.trim()) {
          setMessages(prev => {
            const currentMsg = prev.find(msg => msg.id === assistantMessageId);
            
            logger.debug('[消息更新] 强制更新消息', { 
              hasMsg: !!currentMsg,
              msgId: assistantMessageId,
              currentContentLength: currentMsg?.content?.length || 0,
              responseLength: response.length
            });
            
            // 如果消息存在，直接更新内容（无论是否为空）
            if (currentMsg) {
              // 如果当前内容为空，或者响应内容更长，则更新
              if (!currentMsg.content || currentMsg.content.trim() === '' || response.length > currentMsg.content.length) {
                logger.debug('[消息更新] 更新消息内容', { 
                  wasEmpty: !currentMsg.content || currentMsg.content.trim() === '',
                  willUpdate: true
                });
                return prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: response }
                    : msg
                );
              } else {
                logger.debug('[消息更新] 消息已有内容，保持不变', { 
                  currentLength: currentMsg.content.length,
                  responseLength: response.length
                });
              }
            } else {
              // 如果消息不存在，创建新消息
              logger.debug('[消息更新] 消息不存在，创建新消息');
              return [
                ...prev,
                {
                  id: assistantMessageId,
                  role: 'assistant',
                  content: response,
                  timestamp: new Date(),
                },
              ];
            }
            
            return prev;
          });
        } else {
          logger.debug('[消息更新] 响应为空，移除空消息');
          // 如果响应为空，移除空消息
          setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
        }
      }
      
      // 清除当前 assistant 消息引用（延迟清除，确保所有输出都处理完）
      setTimeout(() => {
        currentAssistantMessageIdRef.current = null;
      }, 100);
    } catch (error) {
      const logger = getLogger();
      logger.error('处理用户输入失败', { error, input: userInput.substring(0, 100) });

      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `❌ 错误: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      };
      setMessages(prev => [
        ...prev.filter(msg => msg.id !== assistantMessageId),
        errorMessage,
      ]);
      currentAssistantMessageIdRef.current = null;
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, handleCommand, onExit]);

  // 处理键盘输入
  useInput((inputKey, key) => {
    // 如果正在处理，只允许退出操作
    if (isProcessing) {
      if (key.ctrl && inputKey === 'c') {
        exit();
      }
      return;
    }

    if (key.return) {
      handleSubmit();
      return;
    }

    if (key.escape) {
      onExit();
      return;
    }

    if (key.upArrow && inputHistoryRef.current.length > 0) {
      if (historyIndex < 0) {
        setHistoryIndex(inputHistoryRef.current.length - 1);
      } else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
      }
      setInput(inputHistoryRef.current[historyIndex] || '');
      return;
    }

    if (key.downArrow && historyIndex >= 0) {
      if (historyIndex < inputHistoryRef.current.length - 1) {
        setHistoryIndex(historyIndex + 1);
        setInput(inputHistoryRef.current[historyIndex + 1] || '');
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
      return;
    }

    if (key.ctrl && inputKey === 'c') {
      exit();
      return;
    }

    if (key.backspace) {
      setInput(prev => {
        if (prev.length > 0) {
          return prev.slice(0, -1);
        }
        return prev;
      });
      return;
    }

    if (key.delete) {
      setInput(prev => {
        // Delete 键删除光标后的字符，这里简化为删除最后一个字符
        if (prev.length > 0) {
          return prev.slice(0, -1);
        }
        return prev;
      });
      return;
    }

    // 处理普通字符输入
    if (inputKey && !key.ctrl && !key.meta && inputKey.length === 1) {
      setInput(prev => prev + inputKey);
      return;
    }
  });

  // 获取角色颜色
  const getRoleColor = (role: string): string => {
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

  // 获取角色图标
  const getRoleIcon = (role: string): string => {
    const icons: Record<string, string> = {
      user: '👤',
      assistant: '🤖',
      system: 'ℹ️',
      'product-manager': '📋',
      architect: '🏗️',
      developer: '💻',
      tester: '🧪',
      'doc-writer': '📝',
    };
    return icons[role] || '•';
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* 标题栏 */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} flexDirection="row" justifyContent="space-between">
        <Text color="cyan" bold>
          🚀 Agent Team - AI Assistant
        </Text>
        <Text color="gray" dimColor>
          {messages.filter(m => m.role !== 'system').length} 条消息
        </Text>
      </Box>

      {/* 消息区域 */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        <Static items={messages}>
          {(message) => {
            // 格式化消息内容：处理换行和列表
            const formatContent = (content: string): string[] => {
              if (!content) return [];
              // 按行分割，保持原有格式
              return content.split('\n');
            };

            const contentLines = formatContent(message.content);

            return (
              <Box key={message.id} marginBottom={1} flexDirection="column">
                {/* 消息头部 */}
                <Box>
                  <Text color={getRoleColor(message.role)} bold>
                    {getRoleIcon(message.role)} [{message.role}]
                  </Text>
                  <Text color="gray" dimColor>
                    {' '}
                    {message.timestamp.toLocaleTimeString()}
                  </Text>
                </Box>
                
                {/* 消息内容 */}
                {contentLines.length > 0 && (
                  <Box marginLeft={2} marginTop={0} flexDirection="column">
                    {contentLines.map((line, index) => (
                      <Text key={index}>
                        {line || ' '}
                      </Text>
                    ))}
                  </Box>
                )}
              </Box>
            );
          }}
        </Static>

        {/* 处理中指示器 */}
        {isProcessing && (
          <Box>
            <Text color="yellow">⏳ AI 正在思考...</Text>
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
          按 Enter 发送 | Esc 退出 | ↑↓ 历史记录 | Ctrl+C 强制退出
        </Text>
      </Box>
    </Box>
  );
};

/**
 * 启动基于 Ink 的聊天 UI
 */
export function startInkChatUI(options: InkChatUIOptions): void {
  const { agent, onExit } = options;

  const App = () => {
    const handleExit = useCallback(() => {
      if (onExit) {
        onExit();
      }
    }, [onExit]);

    return (
      <InkChatInterface
        agent={agent}
        onExit={handleExit}
      />
    );
  };

  render(<App />);
}
