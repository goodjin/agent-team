import { WebSocket, WebSocketServer } from 'ws';
import { Server as HttpServer } from 'http';

export interface WebSocketEvent {
  type: 'status_change' | 'log_entry' | 'artifact_created' | 'subtask_created' | 'progress_update' | 'error';
  timestamp: string;
  data: any;
}

export interface IWebSocketManager {
  subscribe(taskId: string, ws: WebSocket): void;
  unsubscribe(taskId: string, ws: WebSocket): void;
  broadcast(taskId: string, event: WebSocketEvent): void;
  broadcastAll(event: WebSocketEvent): void;
}

export class WebSocketManager implements IWebSocketManager {
  private clients: Map<string, Set<WebSocket>> = new Map();
  private wss: WebSocketServer | null = null;

  attachToServer(server: HttpServer): void {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const taskId = url.searchParams.get('taskId');

      if (taskId) {
        this.subscribe(taskId, ws);

        ws.on('close', () => {
          this.unsubscribe(taskId, ws);
        });
      }

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  subscribe(taskId: string, ws: WebSocket): void {
    if (!this.clients.has(taskId)) {
      this.clients.set(taskId, new Set());
    }
    this.clients.get(taskId)!.add(ws);
  }

  unsubscribe(taskId: string, ws: WebSocket): void {
    this.clients.get(taskId)?.delete(ws);
    if (this.clients.get(taskId)?.size === 0) {
      this.clients.delete(taskId);
    }
  }

  broadcast(taskId: string, event: WebSocketEvent): void {
    const clients = this.clients.get(taskId);
    if (!clients) return;

    const message = JSON.stringify({
      ...event,
      timestamp: new Date().toISOString()
    });

    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  broadcastAll(event: WebSocketEvent): void {
    const message = JSON.stringify({
      ...event,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach(clients => {
      clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    });
  }

  getClientCount(taskId?: string): number {
    if (taskId) {
      return this.clients.get(taskId)?.size || 0;
    }
    let total = 0;
    this.clients.forEach(clients => {
      total += clients.size;
    });
    return total;
  }
}
