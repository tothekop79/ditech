import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { PhotoController } from '../controllers/photo.controller';
import { authenticate } from '../middlewares/auth.middleware';

const UPLOAD_DIR = '/app/uploads/photos';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

const r = Router();
const c = new PhotoController();

r.use(authenticate);
r.get('/plan/:planId', (req, res) => c.list(req, res));
r.post('/plan/:planId/upload', upload.single('photo'), (req, res) => c.upload(req, res));
r.patch('/:id', (req, res) => c.update(req, res));
r.delete('/:id', (req, res) => c.delete(req, res));

export default r;
