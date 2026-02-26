import { generateId } from '../utils/id.js';

export interface DomainEvent {
  id: string;
  type: string;
  timestamp: Date;
  payload: any;
}

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export interface IEventBus {
  publish(event: Omit<DomainEvent, 'id'>): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
  unsubscribe(eventType: string, handler: EventHandler): void;
}

export class EventBus implements IEventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private eventLog: DomainEvent[] = [];
  private maxLogSize = 1000;

  async publish(event: Omit<DomainEvent, 'id'>): Promise<void> {
    const fullEvent: DomainEvent = {
      id: generateId(),
      ...event
    };

    this.eventLog.push(fullEvent);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    const handlers = this.handlers.get(event.type);
    if (!handlers) return;

    const promises = Array.from(handlers).map(async (handler) => {
      try {
        await handler(fullEvent);
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error);
      }
    });

    await Promise.all(promises);
  }

  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  getEventLog(): DomainEvent[] {
    return [...this.eventLog];
  }
}
