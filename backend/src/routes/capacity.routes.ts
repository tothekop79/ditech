import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { capacityService } from '../services/capacity.service';

const router = Router();
router.use(authenticate);

router.get('/daily/:date', async (req, res) => {
  try {
    const data = await capacityService.getDailyCapacity(new Date(req.params.date));
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
  }
});

router.get('/heatmap', async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
    const data = await capacityService.getMonthHeatmap(year, month);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
  }
});

router.get('/conflicts', async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const data = await capacityService.detectConflicts(from, to);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
  }
});

export default router;
