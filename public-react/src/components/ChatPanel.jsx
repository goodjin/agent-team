import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';

const SCROLL_KEY = (taskId) => `master-chat-scroll:${taskId}`;

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export default function ChatPanel({
  taskId,
  messages,
  createMode,
  onSend,
  hasOlder = false,
  loadingOlder = false,
  onLoadMore,
  scrollToBottomTick = 0,
}) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const loadMoreTriggered = useRef(false);
  const prependAnchorRef = useRef(null);
  const prevFirstSeqRef = useRef(null);
  const lastTickRef = useRef(0);
  const didInitialScrollRef = useRef(false);

  useEffect(() => {
    didInitialScrollRef.current = false;
  }, [taskId]);

  const saveScroll = useCallback(() => {
    if (createMode || !taskId) return;
    const el = scrollRef.current;
    if (!el) return;
    try {
      sessionStorage.setItem(SCROLL_KEY(taskId), String(el.scrollTop));
    } catch (_) {}
  }, [createMode, taskId]);

  const debouncedSaveScroll = useRef(debounce(() => saveScroll(), 200)).current;

  const onScroll = () => {
    debouncedSaveScroll();
    const el = scrollRef.current;
    if (!el || !onLoadMore || !hasOlder || loadingOlder) return;
    if (el.scrollTop < 72 && !loadMoreTriggered.current) {
      loadMoreTriggered.current = true;
      prependAnchorRef.current = { prevH: el.scrollHeight, prevTop: el.scrollTop };
      Promise.resolve(onLoadMore()).finally(() => {
        loadMoreTriggered.current = false;
      });
    }
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const firstSeq = messages[0]?._seq;
    const prepended =
      prependAnchorRef.current &&
      prevFirstSeqRef.current != null &&
      firstSeq != null &&
      firstSeq < prevFirstSeqRef.current;

    if (prepended && prependAnchorRef.current) {
      const { prevH, prevTop } = prependAnchorRef.current;
      prependAnchorRef.current = null;
      el.scrollTop = el.scrollHeight - prevH + prevTop;
      prevFirstSeqRef.current = firstSeq;
      return;
    }

    prependAnchorRef.current = null;
    prevFirstSeqRef.current = firstSeq;
  }, [messages]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (createMode || !taskId) {
      el.scrollTop = el.scrollHeight;
      lastTickRef.current = scrollToBottomTick;
      return;
    }
    if (messages.length === 0) return;
    if (didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;

    let saved = null;
    try {
      saved = sessionStorage.getItem(SCROLL_KEY(taskId));
    } catch (_) {}
    const top = saved != null ? Number.parseInt(saved, 10) : NaN;
    if (Number.isFinite(top) && top >= 0) {
      el.scrollTop = Math.min(top, el.scrollHeight - el.clientHeight);
    } else {
      el.scrollTop = el.scrollHeight;
    }
    lastTickRef.current = scrollToBottomTick;
  }, [taskId, messages.length, createMode, scrollToBottomTick]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || createMode) return;

    if (lastTickRef.current !== scrollToBottomTick) {
      lastTickRef.current = scrollToBottomTick;
      el.scrollTop = el.scrollHeight;
      return;
    }

    if (!taskId) {
      el.scrollTop = el.scrollHeight;
      return;
    }

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, scrollToBottomTick, createMode, taskId]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const placeholder = createMode
    ? '描述目标或需求，Enter 发送（将创建任务并启动主控）'
    : '补充需求、追问进展、讨论重做…';

  return (
    <div className="chat-panel-full">
      <div className="chat-aside-header">{createMode ? '主 Agent · 新建' : '主 Agent 对话'}</div>
      <div
        ref={scrollRef}
        className="master-chat-messages"
        id="master-chat-messages"
        onScroll={onScroll}
      >
        {!createMode && taskId && hasOlder && (
          <div className="chat-load-older muted">
            {loadingOlder ? '加载更早消息…' : '上滑加载更早消息'}
          </div>
        )}
        {messages.length === 0 ? (
          <div className="chat-empty muted">
            {createMode ? '输入首条消息即可创建任务并与主 Agent 对话' : '发送消息与主 Agent 对话'}
          </div>
        ) : (
          messages.map((m) => {
            const isWorkerFeed =
              m.role === 'user' &&
              typeof m.content === 'string' &&
              m.content.startsWith('[系统·工人汇报]');
            const roleLabel = isWorkerFeed ? '系统' : m.role === 'user' ? '你' : '主 Agent';
            const key = m._seq != null ? `m-${m._seq}` : `${m.role}-${String(m.content).slice(0, 40)}`;
            return (
              <div
                key={key}
                className={`chat-msg chat-msg-${m.role}${isWorkerFeed ? ' chat-msg-system-feed' : ''}`}
              >
                <span className="chat-msg-role">{roleLabel}</span>
                <div
                  className={`chat-msg-body ${String(m.content || '').startsWith('错误') ? 'chat-msg-error' : 'chat-msg-plain'}`}
                >
                  {String(m.content || '')
                    .split('\n')
                    .map((line, j) => (
                      <span key={j}>
                        {line}
                        <br />
                      </span>
                    ))}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="master-chat-input-row">
        <textarea
          ref={inputRef}
          className="form-input chat-input"
          rows={4}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn btn-primary chat-send" onClick={handleSend}>
          发送
        </button>
      </div>
    </div>
  );
}
