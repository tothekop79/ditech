import { Request, Response } from 'express';
import { z } from 'zod';
import { TeamService } from '../services/team.service';

const svc = new TeamService();

const createSchema = z.object({
  name: z.string().min(1, 'Name required'),
  region: z.enum(['BANGKOK', 'UPC']),
  telegramChatId: z.string().optional().nullable(),
  dailyCap: z.number().int().min(1).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  region: z.enum(['BANGKOK', 'UPC']).optional(),
  telegramChatId: z.string().optional().nullable(),
  dailyCap: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export class TeamController {
  async list(_req: Request, res: Response) {
    try {
      const data = await svc.list();
      res.json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = createSchema.parse(req.body);
      const data = await svc.create(parsed);
      res.status(201).json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const parsed = updateSchema.parse(req.body);
      const data = await svc.update(req.params.id, parsed);
      res.json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const data = await svc.delete(req.params.id);
      res.json({ success: true, ...data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async addMember(req: Request, res: Response) {
    try {
      const data = await svc.addMember(req.params.id, req.body.userId);
      res.status(201).json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async removeMember(req: Request, res: Response) {
    try {
      const data = await svc.removeMember(req.params.id, req.params.userId);
      res.json({ success: true, ...data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async setLead(req: Request, res: Response) {
    try {
      const data = await svc.setLead(req.params.id, req.body.userId || null);
      res.json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async updateChatId(req: Request, res: Response) {
    try {
      const data = await svc.updateChatId(req.params.id, req.body.telegramChatId);
      res.json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }
}
