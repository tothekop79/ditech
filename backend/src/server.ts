import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';

import commandCenterRoutes from './routes/commandCenter.routes';
import authRoutes from './routes/auth.routes';
import installationPlanRoutes from './routes/installationPlan.routes';
import documentRoutes from "./routes/document.routes";
import masterRoutes from './routes/master.routes';
import capacityRoutes from './routes/capacity.routes';
import reportRoutes from './routes/report.routes';
import notificationRoutes from './routes/notification.routes';
import userRoutes from './routes/user.routes';
import teamRoutes from './routes/team.routes';
import commLogRoutes from './routes/communicationLog.routes';
import photoRoutes from './routes/photo.routes';
import regionRoutes from './routes/region.routes';
import provinceRoutes from './routes/province.routes';

import './queues/notification.queue';
import { startScheduler } from './services/scheduler.service';
import { redis } from './config/redis';
import { prisma } from './config/db';

const app = express();
const server = http.createServer(app);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static('/app/uploads'));

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisOk = await redis.ping() === 'PONG';
    res.json({
      status: 'ok',
      services: { db: 'ok', redis: redisOk ? 'ok' : 'fail', telegram: !!process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'not configured' },
    });
  } catch (e) {
    res.status(503).json({ status: 'fail', error: e instanceof Error ? e.message : 'unknown' });
  }
});


// PUT_DEBUG_LOGGER (temporary)
app.use('/api/installation-plans/:id', (req: any, res: any, next: any) => {
  if (req.method === 'PUT') {
    console.log('━━━ PUT BODY ━━━');
    console.log(JSON.stringify(req.body, null, 2));
    const origJson = res.json.bind(res);
    res.json = (data: any) => {
      if (res.statusCode >= 400) {
        console.log('━━━ RESPONSE ━━━', res.statusCode);
        console.log(JSON.stringify(data, null, 2));
      }
      return origJson(data);
    };
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/installation-plans', installationPlanRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/capacity', capacityRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/command-center', commandCenterRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/communication-logs', commLogRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/regions', regionRoutes);
app.use('/api/provinces', provinceRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ success: false, message: err.message || 'Internal error' });
});

const PORT = parseInt(process.env.PORT || '5000');
app.use("/api/documents", documentRoutes);
server.listen(PORT, () => {
  console.log(`
🚀 DITECH Installation Planner
━━━━━━━━━━━━━━━━━━━━━━━━━
   Backend:  http://localhost:${PORT}
   Health:   http://localhost:${PORT}/health
   Env:      ${process.env.NODE_ENV || 'development'}
━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  startScheduler();
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  await redis.quit();
  server.close();
});
