import { Request, Response } from 'express';
import { CommunicationLogService } from '../services/communicationLog.service';

const svc = new CommunicationLogService();

interface AuthReq extends Request {
  user?: { userId: string };
}

export class CommunicationLogController {
  async list(req: Request, res: Response) {
    try {
      const data = await svc.list(req.params.planId);
      res.json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async create(req: AuthReq, res: Response) {
    try {
      const data = await svc.create(req.params.planId, req.body, req.user?.userId);
      res.status(201).json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await svc.delete(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }
}
