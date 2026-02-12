import { AsyncLocalStorage } from 'async_hooks';
import type { TraceContext } from './types.js';

export const traceContextStorage = new AsyncLocalStorage<TraceContext>();

export function getTraceContext(): TraceContext | undefined {
  return traceContextStorage.getStore();
}

export function runWithContext<T>(context: TraceContext, fn: () => T): T {
  return traceContextStorage.run(context, fn);
}

export function updateContext(updates: Partial<TraceContext>): void {
  const current = traceContextStorage.getStore();
  if (current) {
    Object.assign(current, updates);
  }
}
