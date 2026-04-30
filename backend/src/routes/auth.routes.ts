import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();
const ctrl = new AuthController();
router.post('/login', (req, res) => ctrl.login(req, res));
export default router;
