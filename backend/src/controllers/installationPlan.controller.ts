import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { installationPlanService } from '../services/installationPlan.service';

export class InstallationPlanController {
  async create(req: AuthRequest, res: Response) {
    try {
      const plan = await installationPlanService.create(req.body, req.user?.userId);
      res.status(201).json({ success: true, data: plan });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async getAll(req: AuthRequest, res: Response) {
    try {
      const result = await installationPlanService.getAll(req.query as any);
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const plan = await installationPlanService.getById(req.params.id);
      res.json({ success: true, data: plan });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      res.status(msg === 'Plan not found' ? 404 : 400).json({ success: false, message: msg });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const plan = await installationPlanService.update(req.params.id, req.body, req.user?.userId);
      res.json({ success: true, data: plan });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async reschedule(req: AuthRequest, res: Response) {
    try {
      const plan = await installationPlanService.reschedule(req.params.id, req.body.newDate, req.user?.userId);
      res.json({ success: true, data: plan });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      const result = await installationPlanService.delete(req.params.id);
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async statistics(req: AuthRequest, res: Response) {
    try {
      const filters: any = {};
      if (req.query.storeRegion) filters.storeRegion = req.query.storeRegion;
      if (req.query.from) filters.from = new Date(req.query.from as string);
      if (req.query.to) filters.to = new Date(req.query.to as string);
      const stats = await installationPlanService.getStatistics(filters);
      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async validateImport(req: AuthRequest, res: Response) {
    try {
      const result = await installationPlanService.validateImportRows(req.body.rows, req.body.mode || 'create');
      res.json({ success: true, data: result });
    } catch (e) {
      console.error('Validate import error:', e);
      const msg = e instanceof Error ? e.message : 'Failed';
      const details = (e as any)?.cause || (e as any)?.errors || null;
      res.status(400).json({ success: false, message: msg, details });
    }
  }

  async bulkImport(req: AuthRequest, res: Response) {
    try {
      const result = await installationPlanService.bulkImport(req.body.rows, req.user?.userId, req.body.mode || 'create');
      res.json({ success: true, data: result });
    } catch (e) {
      console.error('Bulk import error:', e);
      const msg = e instanceof Error ? e.message : 'Failed';
      const details = (e as any)?.cause || (e as any)?.errors || null;
      res.status(400).json({ success: false, message: msg, details });
    }
  }
  async linkEvent(req: any, res: any) {
    try {
      const { eventId, inheritFields = true } = req.body;
      if (!eventId) {
        return res.status(400).json({ success: false, message: 'eventId is required' });
      }
      const userId = req.user?.userId ?? req.user?.id;
      const plan = await installationPlanService.linkToEvent(req.params.id, eventId, inheritFields, userId);
      res.json({ success: true, data: plan });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async unlinkEvent(req: any, res: any) {
    try {
      const userId = req.user?.userId ?? req.user?.id;
      const plan = await installationPlanService.unlinkFromEvent(req.params.id, userId);
      res.json({ success: true, data: plan });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

}
