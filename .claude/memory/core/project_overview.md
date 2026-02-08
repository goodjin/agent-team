# Project Overview

## File Metadata
- **Last Updated**: 2026-02-08
- **Git Commit**: feat: implement task-12 UI
- **Git Branch**: main
- **Version**: 1.1
- **Maintainer**: cat

---

## Project Information

### Basic Info
- **Name**: agent-team
- **Type**: Multi-agent system
- **Language**: TypeScript
- **Description**: Agent team coordination system with task management

---

## Technical Stack

### Primary Technologies
- **Language**: TypeScript (strict mode, ES2022)
- **Framework**: Express (backend), React + Ink (UI)
- **Storage**: File-based / in-memory
- **UI**: Existing web UI in `public/` (HTML/JS/CSS), React TSX components in `src/ui/`
- **Server**: `src/server/index.ts` on port 3020, static files from `public/`
- **SSE**: Real-time updates via Server-Sent Events on `/api/tasks/:id/events`

---

## Current Goals

### Completed Goals
1. **Implement UI (Task 12)**
   - Description: Create user interface with SSE real-time updates
   - Status: COMPLETED
   - Files created: `src/ui/pages/TaskList.tsx`, `src/ui/pages/TaskDetail.tsx`, `src/ui/components/AgentList.tsx`, `src/ui/components/AgentChat.tsx`, `src/ui/utils/api-client.ts`, `src/ui/styles/main.css`
   - SSE endpoints added to `src/server/api.ts` and `src/server/routes/tasks.ts`
   - `public/app.js` updated with SSE subscription logic

### Important Notes
- tsconfig `lib: ["ES2022"]` does NOT include DOM - use `(e.target as any).value` workaround in React components
- Pre-existing TS errors in `src/cli/cli.ts` and `src/core/project-agent.ts` - not our concern
- TaskManager does NOT have `.off()` method - use closed flag pattern for SSE cleanup
- AgentMgr does NOT have `.off()` method - same pattern

---

## Tags
#project #overview #architecture #goals
