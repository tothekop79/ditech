import { Request, Response } from 'express';
import { PhotoService } from '../services/photo.service';

const svc = new PhotoService();

interface AuthReq extends Request {
  user?: { userId: string };
  file?: Express.Multer.File;
}

export class PhotoController {
  async list(req: Request, res: Response) {
    try {
      const data = await svc.list(req.params.planId);
      res.json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async upload(req: AuthReq, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }
      const data = await svc.create(
        req.params.planId,
        req.file,
        { category: req.body.category, caption: req.body.caption },
        req.user?.userId
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const data = await svc.update(req.params.id, req.body.caption, req.body.category);
      res.json({ success: true, data });
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
