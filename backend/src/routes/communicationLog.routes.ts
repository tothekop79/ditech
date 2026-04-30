import { Router } from 'express';
import { CommunicationLogController } from '../controllers/communicationLog.controller';
import { authenticate } from '../middlewares/auth.middleware';

const r = Router();
const c = new CommunicationLogController();

r.use(authenticate);
r.get('/plan/:planId', (req, res) => c.list(req, res));
r.post('/plan/:planId', (req, res) => c.create(req, res));
r.delete('/:id', (req, res) => c.delete(req, res));

export default r;
