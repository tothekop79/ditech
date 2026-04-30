import { Router, Request, Response } from 'express';
import { documentService } from '../services/document.service';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { planId, docType } = req.query as any;
    const docs = await documentService.list(planId, docType);
    res.json({ success: true, data: docs });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ⬇ specific routes BEFORE /:id to avoid shadowing
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const html = await documentService.renderHtml(req.params.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    res.status(404).send(`<pre>${err.message}</pre>`);
  }
});

router.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const { buffer, filename } = await documentService.renderPdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await documentService.get(req.params.id);
    res.json({ success: true, data: doc });
  } catch (err: any) {
    res.status(404).json({ success: false, message: err.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId ?? (req as any).user?.id ?? null;
    const { planId, docType, payload } = req.body;
    if (!planId || !docType) {
      res.status(400).json({ success: false, message: 'planId and docType required' });
      return;
    }
    const doc = await documentService.create({
      planId,
      docType,
      payload: payload || {},
      createdById: userId,
    });
    res.json({ success: true, data: doc });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await documentService.update(req.params.id, req.body);
    res.json({ success: true, data: doc });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await documentService.delete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
