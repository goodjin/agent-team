import * as path from 'path';
import type { Tool } from '../../domain/tool/index.js';
import type { ToolRegistry } from '../../domain/tool/index.js';
import { DynamicToolLoader } from '../../plugins/dynamic-tool-loader.js';
import { PluginLoader } from '../../plugins/loader.js';

/**
 * 扫描 plugins 目录，将 tool 类型插件挂入与 AgentExecutionEngine 共用的 ToolRegistry。
 * 包装器始终调用 DynamicToolLoader.executeTool，因而热重载后仍指向最新实现。
 */
export async function registerPluginToolsOnRegistry(
  toolRegistry: ToolRegistry,
  pluginsDir: string = path.join(process.cwd(), 'plugins')
): Promise<{ loader: PluginLoader; dynamicToolLoader: DynamicToolLoader }> {
  const loader = new PluginLoader(pluginsDir);
  await loader.loadAll();
  const dynamicToolLoader = new DynamicToolLoader(loader);
  await dynamicToolLoader.loadToolsFromPlugins();

  for (const meta of dynamicToolLoader.listTools()) {
    const name = meta.name;
    if (toolRegistry.has(name)) {
      console.warn(`[plugins] Skip plugin tool "${name}" — conflicts with built-in`);
      continue;
    }
    const latest = dynamicToolLoader.getTool(name);
    const bridge: Tool = {
      name,
      description: latest?.description ?? `Plugin tool: ${name}`,
      category: 'ai',
      parameters: {
        type: 'object',
        description: `插件「${name}」的参数对象（如 url、method 等，参见插件文档）`,
        properties: {},
      },
      dangerous: true,
      execute: async (params, _context) => {
        try {
          const data = await dynamicToolLoader.executeTool(name, (params ?? {}) as Record<string, unknown>);
          return { success: true, data };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    };
    toolRegistry.register(bridge);
  }

  dynamicToolLoader.startWatching(pluginsDir);
  return { loader, dynamicToolLoader };
}
