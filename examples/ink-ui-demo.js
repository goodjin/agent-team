import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Ink UI 演示示例
 * 展示如何使用基于 Ink 的现代化 CLI 界面
 */
import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { config } from 'dotenv';
config();
/**
 * 简单的聊天界面演示
 */
const ChatDemo = () => {
    const [messages, setMessages] = React.useState([
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
        }
        else if (key.escape || (key.ctrl && inputKey === 'c')) {
            exit();
        }
        else if (inputKey && !key.ctrl && !key.meta) {
            setInput(prev => prev + inputKey);
        }
        else if (key.backspace) {
            setInput(prev => prev.slice(0, -1));
        }
    });
    return (_jsxs(Box, { flexDirection: "column", height: "100%", children: [_jsx(Box, { borderStyle: "single", borderColor: "cyan", paddingX: 1, children: _jsx(Text, { color: "cyan", bold: true, children: "\uD83D\uDE80 Agent Team - Ink UI Demo" }) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, paddingX: 1, paddingY: 1, children: messages.map((msg, idx) => (_jsx(Box, { marginBottom: 1, children: _jsxs(Text, { color: msg.role === 'user' ? 'cyan' : msg.role === 'assistant' ? 'green' : 'gray', children: ["[", msg.role, "]: ", msg.content] }) }, idx))) }), _jsxs(Box, { borderStyle: "single", borderColor: "cyan", paddingX: 1, children: [_jsx(Text, { color: "cyan", children: "You: " }), _jsx(Text, { children: input }), _jsx(Text, { color: "gray", dimColor: true, children: "\u2588" })] }), _jsx(Box, { paddingX: 1, paddingY: 0, children: _jsx(Text, { color: "gray", dimColor: true, children: "\u8F93\u5165\u6D88\u606F\u540E\u6309 Enter | Esc \u6216 Ctrl+C \u9000\u51FA" }) })] }));
};
/**
 * 主函数
 */
async function main() {
    console.log('启动 Ink UI 演示...\n');
    render(_jsx(ChatDemo, {}));
}
main().catch(console.error);
//# sourceMappingURL=ink-ui-demo.js.map