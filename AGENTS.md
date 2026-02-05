# AGENTS.md

This document provides guidelines for AI agents working in this codebase.

## Build, Lint, and Test Commands

### Core Commands
```bash
npm run build          # Compile TypeScript to JavaScript (tsc)
npm run dev            # Watch mode compilation
npm run test           # Run vitest test suite
npm run lint           # Run ESLint on src directory
```

### Running a Single Test
```bash
# Run vitest with file filter
npx vitest run test-file-name

# Run specific test by name
npx vitest run -t "test name"

# Run vitest in watch mode
npx vitest
```

### Browser E2E Tests (Playwright)
```bash
# Install browser (required once)
npx playwright install chromium

# Run browser tests
npx playwright test tests/e2e/browser.test.ts

# Run with debug mode
npx playwright test tests/e2e/browser.test.ts --debug

# Run specific browser test
npx playwright test tests/e2e/browser.test.ts -g "should load page"
```

### Development Commands
```bash
npm run example         # Run basic usage example
npm run example:basic   # Run basic workflow example
npm run example:workflow # Run workflow example
npm run interactive     # Start interactive CLI mode
npm run server          # Start Express server
npm run server:dev      # Start server with watch mode
npm run ui:demo         # Run UI demo
```

### Pre-publish
```bash
npm run prepublishOnly  # Build before publishing
```

## Code Style Guidelines

### Imports
- Use ESM imports with `.js` extension for local files: `import { Foo } from './foo.js';`
- Group imports in order: built-in → external → local (relative)
- Use named exports for most exports, default exports for main class
- Use `@/*` alias for internal imports: `import { Foo } from '@/core/foo.js';`

### TypeScript
- Strict mode is enabled - no `any` without explicit annotation
- Use interfaces for object shapes, types for unions/primitives
- Define all types in `src/types/` directory
- Use Zod for runtime validation (import from 'zod')
- Export types alongside implementations

### Naming Conventions
- **Classes**: PascalCase (`ProjectAgent`, `TaskManager`)
- **Interfaces**: PascalCase with descriptive names (`AgentEventData`)
- **Types**: PascalCase (`RoleType`, `Priority`)
- **Functions/variables**: camelCase (`getAvailableTools`, `taskManager`)
- **Constants**: SCREAMING_SNAKE_CASE for config values
- **Files**: kebab-case for utilities, PascalCase for classes (`task-manager.ts`, `ProjectAgent.ts`)

### Error Handling
- Throw `Error` objects with descriptive messages
- Catch errors at appropriate levels and emit events where needed
- Use `ToolResult<T>` pattern for tool execution results: `{ success: boolean; data?: T; error?: string }`
- Wrap async operations in try/catch blocks
- Emit error events for agent-wide error handling

### Code Structure
- Main entry point: `src/index.ts` - barrel file exporting all public APIs
- Core components: `src/core/` - agent, task, workflow logic
- Tools: `src/tools/` - file, git, code operation tools
- Services: `src/services/` - LLM integrations
- Config: `src/config/` - configuration management
- Types: `src/types/` - TypeScript interfaces and types

### Documentation
- Use JSDoc comments for public APIs: `/** Description */`
- Document function parameters and return types
- Include examples in complex function docstrings
- Keep comments concise; avoid redundant comments

### React/Ink Components
- Use functional components with hooks
- Props interface naming: `ComponentNameProps`
- Handle async operations with `useEffect` and state
- Support keyboard navigation in CLI interfaces

### General Patterns
- Use private fields (`private foo: string`) for encapsulation
- Use getters/setters for property access when logic is needed
- Prefer composition over inheritance
- Use Map/Set for collections with unique keys
- Destructure objects for clarity: `const { foo, bar } = obj;`
- Use early returns to reduce nesting
