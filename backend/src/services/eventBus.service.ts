import { EventEmitter } from 'events';

/**
 * Singleton event bus for realtime fan-out (Command Center SSE).
 *
 * Services emit semantic events here; SSE endpoint subscribes
 * and forwards them to all connected clients.
 *
 * Events:
 *   'plan:created'      { plan }
 *   'plan:updated'      { plan, changes }
 *   'plan:deleted'      { id }
 *   'photo:uploaded'    { photo, plan, uploadedBy }
 *   'notification:sent' { recipient, ruleName, body, createdAt }
 *   'notification:failed' { recipient, ruleName, errorMessage }
 *   'tick'              { now }   ← emitted every 5s for keepalive
 */
class CommandBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // many SSE clients possible
  }
}

export const commandBus = new CommandBus();

// Heartbeat tick every 5s — keeps SSE connections alive through proxies
setInterval(() => {
  commandBus.emit('tick', { now: new Date().toISOString() });
}, 5000);
