import { Router } from 'express';
import { TeamController } from '../controllers/team.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();
const ctrl = new TeamController();

router.use(authenticate);

router.get('/', (req, res) => ctrl.list(req, res));
router.post('/', authorize('ADMIN', 'PROJECT_MANAGER'), (req, res) => ctrl.create(req, res));
router.patch('/:id', authorize('ADMIN', 'PROJECT_MANAGER'), (req, res) => ctrl.update(req, res));
router.delete('/:id', authorize('ADMIN'), (req, res) => ctrl.delete(req, res));

router.post('/:id/members', authorize('ADMIN', 'PROJECT_MANAGER'), (req, res) => ctrl.addMember(req, res));
router.delete('/:id/members/:userId', authorize('ADMIN', 'PROJECT_MANAGER'), (req, res) => ctrl.removeMember(req, res));
router.patch('/:id/lead', authorize('ADMIN', 'PROJECT_MANAGER'), (req, res) => ctrl.setLead(req, res));
router.patch('/:id/chat-id', authorize('ADMIN', 'PROJECT_MANAGER'), (req, res) => ctrl.updateChatId(req, res));

export default router;
