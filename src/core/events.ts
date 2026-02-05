/**
 * Event System
 * Simple event dispatch and listener management system
 */

export type EventType =
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'agent.created'
  | 'agent.stopped'
  | 'agent.deleted'
  | 'agent.status.changed'
  | 'agent.restarted'
  | 'agent.heartbeat'
  | 'agent.health.failed'
  | 'agent.auto-restarted'
  | 'agent.monitoring.started'
  | 'agent.monitoring.stopped';

export interface Event<T = any> {
  type: EventType;
  data: T;
  timestamp: Date;
}

export type EventHandler = (event: Event) => void | Promise<void>;

export class EventSystem {
  private listeners: Map<EventType, Set<EventHandler>> = new Map();
  private onceListeners: Map<EventType, Set<EventHandler>> = new Map();
  private eventStats: Map<string, { count: number; handlers: number }> = new Map();

  /**
   * Register an event listener
   */
  on(eventType: EventType, handler: EventHandler): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);
    this.updateStats(eventType, 'add');
  }

  /**
   * Register a one-time event listener
   */
  once(eventType: EventType, handler: EventHandler): void {
    if (!this.onceListeners.has(eventType)) {
      this.onceListeners.set(eventType, new Set());
    }
    this.onceListeners.get(eventType)!.add(handler);
    this.updateStats(eventType, 'add');
  }

  /**
   * Remove an event listener
   */
  off(eventType: EventType, handler: EventHandler): void {
    this.listeners.get(eventType)?.delete(handler);
    this.onceListeners.get(eventType)?.delete(handler);
    this.updateStats(eventType, 'remove');
  }

  /**
   * Emit an event
   */
  emit<T = any>(eventType: EventType, data: T): void {
    const event: Event<T> = {
      type: eventType,
      data,
      timestamp: new Date(),
    };

    const handlers = this.listeners.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      }
    }

    const onceHandlers = this.onceListeners.get(eventType);
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in once event handler for ${eventType}:`, error);
        }
      }
      this.onceListeners.delete(eventType);
    }

    this.incrementEventCount(eventType);
  }

  /**
   * Get all listeners for an event type
   */
  getListeners(eventType: EventType): EventHandler[] {
    const handlers = this.listeners.get(eventType);
    return handlers ? Array.from(handlers) : [];
  }

  /**
   * Remove all listeners for an event type or all events
   */
  removeAllListeners(eventType?: EventType): void {
    if (eventType) {
      this.listeners.delete(eventType);
      this.onceListeners.delete(eventType);
      this.eventStats.delete(eventType);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
      this.eventStats.clear();
    }
  }

  /**
   * Get event statistics
   */
  getEventStats(): { [eventType: string]: { count: number; handlers: number } } {
    const stats: { [eventType: string]: { count: number; handlers: number } } = {};

    for (const [eventType, listeners] of this.listeners) {
      stats[eventType] = {
        count: this.eventStats.get(eventType)?.count || 0,
        handlers: listeners.size,
      };
    }

    return stats;
  }

  /**
   * Get the number of listeners for an event type
   */
  listenerCount(eventType: EventType): number {
    const regular = this.listeners.get(eventType)?.size || 0;
    const once = this.onceListeners.get(eventType)?.size || 0;
    return regular + once;
  }

  /**
   * Check if there are listeners for an event type
   */
  hasListeners(eventType: EventType): boolean {
    return this.listenerCount(eventType) > 0;
  }

  private updateStats(eventType: EventType, action: 'add' | 'remove'): void {
    if (!this.eventStats.has(eventType)) {
      this.eventStats.set(eventType, { count: 0, handlers: 0 });
    }
    const stats = this.eventStats.get(eventType)!;
    if (action === 'add') {
      stats.handlers++;
    } else if (action === 'remove' && stats.handlers > 0) {
      stats.handlers--;
    }
  }

  private incrementEventCount(eventType: EventType): void {
    if (!this.eventStats.has(eventType)) {
      this.eventStats.set(eventType, { count: 0, handlers: 0 });
    }
    this.eventStats.get(eventType)!.count++;
  }
}
