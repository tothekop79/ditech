import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { z } from 'zod';

const svc = new UserService();

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'INSTALLER', 'QA', 'CUSTOMER']),
  idCard: z.string().optional().nullable(),
  idCardPhotoUrl: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  phoneForDoc: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
});

const updateSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'INSTALLER', 'QA', 'CUSTOMER']).optional(),
  isActive: z.boolean().optional(),
  province: z.string().optional(),
  idCard: z.string().optional().nullable(),
  idCardPhotoUrl: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  phoneForDoc: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
});

export class UserController {
  async list(req: Request, res: Response) {
    try {
      const role = req.query.role as any;
      const isActive = req.query.isActive ? req.query.isActive === 'true' : undefined;
      const data = await svc.list({ role, isActive });
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

  async resetPassword(req: Request, res: Response) {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be 6+ chars' });
      }
      await svc.resetPassword(req.params.id, newPassword);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }
}
