import { Router, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import {
  createCameraModelSchema,
  updateCameraModelSchema,
} from '../middlewares/installationDesign.validation';
import { cameraModelService } from '../services/cameraModel.service';

const UPLOAD_DIR = '/app/uploads/camera-models';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.png';
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },  // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files (PNG, JPG, WebP) allowed'));
  },
});

const router = Router();
router.use(authenticate);

// ── List models ──
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { brand, isSystem, isActive } = req.query;
    const models = await cameraModelService.list({
      brand: brand as string | undefined,
      isSystem: isSystem === 'true' ? true : isSystem === 'false' ? false : undefined,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
    res.json({ success: true, data: models });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const model = await cameraModelService.get(req.params.id);
    res.json({ success: true, data: model });
  } catch (err: any) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── Create / update / delete (NOT INSTALLER) ──
router.post(
  '/',
  authorize('ADMIN', 'PROJECT_MANAGER', 'QA', 'CUSTOMER'),
  validate(createCameraModelSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const model = await cameraModelService.create(req.body);
      res.status(201).json({ success: true, data: model });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  },
);

router.patch(
  '/:id',
  authorize('ADMIN', 'PROJECT_MANAGER', 'QA', 'CUSTOMER'),
  validate(updateCameraModelSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const model = await cameraModelService.update(req.params.id, req.body);
      res.json({ success: true, data: model });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  },
);

router.delete(
  '/:id',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  async (req: AuthRequest, res: Response) => {
    try {
      await cameraModelService.delete(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  },
);

// ── Image upload ──
router.post(
  '/:id/image',
  authorize('ADMIN', 'PROJECT_MANAGER', 'QA', 'CUSTOMER'),
  upload.single('image'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const model = await cameraModelService.setImage(req.params.id, req.file.filename);
      res.json({ success: true, data: model });
    } catch (err: any) {
      // Cleanup file on error
      if (req.file) {
        const fp = path.join(UPLOAD_DIR, req.file.filename);
        if (fs.existsSync(fp)) {
          try { fs.unlinkSync(fp); } catch { /* ignore */ }
        }
      }
      res.status(400).json({ success: false, message: err.message });
    }
  },
);

router.delete(
  '/:id/image',
  authorize('ADMIN', 'PROJECT_MANAGER', 'QA', 'CUSTOMER'),
  async (req: AuthRequest, res: Response) => {
    try {
      const model = await cameraModelService.clearImage(req.params.id);
      res.json({ success: true, data: model });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  },
);

export default router;
