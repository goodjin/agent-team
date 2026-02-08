import React, { useState, useEffect } from 'react';
import type { TaskMessage as Message } from '../../types/index.js';
import { apiClient } from '../utils/api-client.js';

interface AgentChatProps {
  agentId: string;
  onClose: () => void;
}

export const AgentChat: React.FC<AgentChatProps> = ({ agentId, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadMessages();

    // 订阅新消息
    const eventSource = new EventSource(`/api/agents/${agentId}/messages/events`);

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setMessages((prev) => [...prev, message]);
      } catch (err) {
        console.error('Failed to parse message SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      console.warn('SSE connection error for agent messages:', agentId);
    };

    return () => {
      eventSource.close();
    };
  }, [agentId]);

  const loadMessages = async () => {
    try {
      const response = await apiClient.get(`/agents/${agentId}/messages`);
      setMessages(response.data?.messages || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    setSending(true);
    const message = input.trim();
    setInput('');

    try {
      await apiClient.post(`/agents/${agentId}/messages`, {
        content: message,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setInput(message); // 恢复输入
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  return (
    <div className="agent-chat">
      <div className="chat-header">
        <h3>Chat with {agentId}</h3>
        <button onClick={onClose} className="close-btn">
          x
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((message, index) => (
          <MessageItem key={index} message={message} />
        ))}
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setInput((e.target as any).value as string);
          }}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          disabled={sending}
        />
        <button onClick={sendMessage} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
};

interface MessageItemProps {
  message: Message;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  return (
    <div className={`message message-${message.role}`}>
      <div className="message-role">{message.role}</div>
      <div className="message-content">{message.content}</div>
      <div className="message-time">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
};
