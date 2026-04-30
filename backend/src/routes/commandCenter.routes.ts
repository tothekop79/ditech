import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { commandCenterService } from '../services/commandCenter.service';
import { commandBus } from '../services/eventBus.service';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-prod';

// ─── Snapshot — authenticated normally ───
router.get('/snapshot', authenticate, async (_req: Request, res: Response) => {
  try {
    const data = await commandCenterService.snapshot();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Snapshot failed' });
  }
});

// ─── SSE stream ───
// EventSource cannot send Authorization header, so we accept ?token=
// in the query string. Token is the same JWT from /api/auth/login.
router.get('/stream', async (req: Request, res: Response) => {
  const token = (req.query.token as string) || '';
  if (!token) {
    res.status(401).end('Missing token');
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded?.userId) {
      res.status(401).end('Invalid token');
      return;
    }
  } catch {
    res.status(401).end('Invalid token');
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Initial hello
  res.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

  const sendEvent = (eventName: string, payload: any) => {
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // client may have disconnected
    }
  };

  // Subscribe to bus events
  const onPlanCreated = (p: any) => sendEvent('plan:created', p);
  const onPlanUpdated = (p: any) => sendEvent('plan:updated', p);
  const onPlanDeleted = (p: any) => sendEvent('plan:deleted', p);
  const onPhotoUploaded = (p: any) => sendEvent('photo:uploaded', p);
  const onNotifSent = (p: any) => sendEvent('notification:sent', p);
  const onNotifFailed = (p: any) => sendEvent('notification:failed', p);
  const onTick = (p: any) => sendEvent('tick', p);

  commandBus.on('plan:created', onPlanCreated);
  commandBus.on('plan:updated', onPlanUpdated);
  commandBus.on('plan:deleted', onPlanDeleted);
  commandBus.on('photo:uploaded', onPhotoUploaded);
  commandBus.on('notification:sent', onNotifSent);
  commandBus.on('notification:failed', onNotifFailed);
  commandBus.on('tick', onTick);

  // Cleanup on close
  req.on('close', () => {
    commandBus.off('plan:created', onPlanCreated);
    commandBus.off('plan:updated', onPlanUpdated);
    commandBus.off('plan:deleted', onPlanDeleted);
    commandBus.off('photo:uploaded', onPhotoUploaded);
    commandBus.off('notification:sent', onNotifSent);
    commandBus.off('notification:failed', onNotifFailed);
    commandBus.off('tick', onTick);
    try { res.end(); } catch { /* noop */ }
  });
});

export default router;
