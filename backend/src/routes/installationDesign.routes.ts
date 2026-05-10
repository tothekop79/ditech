import { Router, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import {
  createDesignSchema,
  updateDesignSchema,
  createSensorSchema,
  updateSensorSchema,
  createZoneSchema,
  updateZoneSchema,
} from '../middlewares/installationDesign.validation';
import { installationDesignService } from '../services/installationDesign.service';

const UPLOAD_DIR = '/app/uploads/designs';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.png', '.jpg', '.jpeg'].includes(ext) ? ext : '.png';
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },  // 20MB for floor plans
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only PNG/JPG floor plans allowed'));
  },
});

const router = Router();
router.use(authenticate);

// ════════════════════════════════════════════════
// Design CRUD
// ════════════════════════════════════════════════

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { planId, eventId, designerId, status } = req.query;
    const designs = await installationDesignService.list(
      {
        planId: planId as string | undefined,
        eventId: eventId as string | undefined,
        designerId: designerId as string | undefined,
        status: status as string | undefined,
      },
      { userId: req.user!.userId, role: req.user!.role },
    );
    res.json({ success: true, data: designs });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const design = await installationDesignService.get(req.params.id, {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    res.json({ success: true, data: design });
  } catch (err: any) {
    const code = err.message.startsWith('Forbidden') ? 403 : 404;
    res.status(code).json({ success: false, message: err.message });
  }
});

router.post(
  '/',
  authorize('ADMIN', 'PROJECT_MANAGER', 'INSTALLER'),
  validate(createDesignSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const design = await installationDesignService.create(req.body, {
        userId: req.user!.userId,
        role: req.user!.role,
      });
      res.status(201).json({ success: true, data: design });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  },
);

router.patch(
  '/:id',
  validate(updateDesignSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const design = await installationDesignService.update(req.params.id, req.body, {
        userId: req.user!.userId,
        role: req.user!.role,
      });
      res.json({ success: true, data: design });
    } catch (err: any) {
      const code = err.message.startsWith('Forbidden') ? 403 : 400;
      res.status(code).json({ success: false, message: err.message });
    }
  },
);

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await installationDesignService.delete(req.params.id, {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    res.json({ success: true });
  } catch (err: any) {
    const code = err.message.startsWith('Forbidden') ? 403 : 400;
    res.status(code).json({ success: false, message: err.message });
  }
});

// ── Manual recalc ──
router.post('/:id/recalc', async (req: AuthRequest, res: Response) => {
  try {
    const design = await installationDesignService.recalc(req.params.id, {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    res.json({ success: true, data: design });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── Floor plan upload ──
router.post(
  '/:id/floor-plan',
  upload.single('floorPlan'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      // Read image dimensions via sharp
      const filePath = path.join(UPLOAD_DIR, req.file.filename);
      const metadata = await sharp(filePath).metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;

      const design = await installationDesignService.setFloorPlan(
        req.params.id,
        req.file.filename,
        width,
        height,
        { userId: req.user!.userId, role: req.user!.role },
      );
      res.json({ success: true, data: design });
    } catch (err: any) {
      // Cleanup on error
      if (req.file) {
        const fp = path.join(UPLOAD_DIR, req.file.filename);
        if (fs.existsSync(fp)) {
          try { fs.unlinkSync(fp); } catch { /* ignore */ }
        }
      }
      const code = err.message.startsWith('Forbidden') ? 403 : 400;
      res.status(code).json({ success: false, message: err.message });
    }
  },
);

// ════════════════════════════════════════════════
// Sensor sub-resource: /designs/:id/sensors
// ════════════════════════════════════════════════

router.get('/:id/sensors', async (req: AuthRequest, res: Response) => {
  try {
    const sensors = await installationDesignService.sensors.list(req.params.id, {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    res.json({ success: true, data: sensors });
  } catch (err: any) {
    res.status(403).json({ success: false, message: err.message });
  }
});

router.post(
  '/:id/sensors',
  validate(createSensorSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const sensor = await installationDesignService.sensors.create(req.params.id, req.body, {
        userId: req.user!.userId,
        role: req.user!.role,
      });
      res.status(201).json({ success: true, data: sensor });
    } catch (err: any) {
      const code = err.message.startsWith('Forbidden') ? 403 : 400;
      res.status(code).json({ success: false, message: err.message });
    }
  },
);

router.patch(
  '/:id/sensors/:sensorId',
  validate(updateSensorSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const sensor = await installationDesignService.sensors.update(
        req.params.id,
        req.params.sensorId,
        req.body,
        { userId: req.user!.userId, role: req.user!.role },
      );
      res.json({ success: true, data: sensor });
    } catch (err: any) {
      const code = err.message.startsWith('Forbidden') ? 403 : 400;
      res.status(code).json({ success: false, message: err.message });
    }
  },
);

router.delete('/:id/sensors/:sensorId', async (req: AuthRequest, res: Response) => {
  try {
    await installationDesignService.sensors.delete(req.params.id, req.params.sensorId, {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    res.json({ success: true });
  } catch (err: any) {
    const code = err.message.startsWith('Forbidden') ? 403 : 400;
    res.status(code).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════
// Zone sub-resource: /designs/:id/zones
// ════════════════════════════════════════════════

router.get('/:id/zones', async (req: AuthRequest, res: Response) => {
  try {
    const zones = await installationDesignService.zones.list(req.params.id, {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    res.json({ success: true, data: zones });
  } catch (err: any) {
    res.status(403).json({ success: false, message: err.message });
  }
});

router.post(
  '/:id/zones',
  validate(createZoneSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const zone = await installationDesignService.zones.create(req.params.id, req.body, {
        userId: req.user!.userId,
        role: req.user!.role,
      });
      res.status(201).json({ success: true, data: zone });
    } catch (err: any) {
      const code = err.message.startsWith('Forbidden') ? 403 : 400;
      res.status(code).json({ success: false, message: err.message });
    }
  },
);

router.patch(
  '/:id/zones/:zoneId',
  validate(updateZoneSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const zone = await installationDesignService.zones.update(
        req.params.id,
        req.params.zoneId,
        req.body,
        { userId: req.user!.userId, role: req.user!.role },
      );
      res.json({ success: true, data: zone });
    } catch (err: any) {
      const code = err.message.startsWith('Forbidden') ? 403 : 400;
      res.status(code).json({ success: false, message: err.message });
    }
  },
);

router.delete('/:id/zones/:zoneId', async (req: AuthRequest, res: Response) => {
  try {
    await installationDesignService.zones.delete(req.params.id, req.params.zoneId, {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    res.json({ success: true });
  } catch (err: any) {
    const code = err.message.startsWith('Forbidden') ? 403 : 400;
    res.status(code).json({ success: false, message: err.message });
  }
});

export default router;
