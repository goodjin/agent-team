# AgentOS Team

## Project: Agent Team

Multi-role AI agent system for project management and development.

## Web Console (Phase 5)

**Status**: Implemented and Running

### Implementation Details

- **Web Server**: Express-based server at `src/server/index.ts`
- **Static UI**: Complete web interface in `public/` directory
  - `index.html` - Main HTML with all page layouts
  - `styles.css` - Full styling with CSS variables and dark mode
  - `app.js` - Frontend JavaScript with API integration

### Pages Implemented

1. **Dashboard** - System status, agent status, task progress, resource usage
2. **Task Center** - Task list, creation, status management
3. **Agent Monitor** - Real-time agent status monitoring
4. **Settings** - LLM configuration, rules configuration

### API Endpoints

- `/api/tasks` - Task CRUD operations
- `/api/agents` - Agent management
- `/api/projects` - Project management
- `/api/workflows` - Workflow management
- `/api/roles` - Role management
- `/api/config` - Configuration management

### Running the Web Console

```bash
# Start server
npm run server

# Development mode with watch
npm run server:dev
```

Server runs at: http://localhost:3020

### Technology Stack

- **Frontend**: Vanilla JavaScript, CSS with variables
- **Backend**: Express.js with TypeScript
- **API**: RESTful JSON API
- **Real-time**: Polling-based updates (30s interval)

### Notes

- Single-user, no authentication required
- Supports dark mode
- Responsive design (mobile-friendly)
- All operations have immediate feedback via toast notifications
