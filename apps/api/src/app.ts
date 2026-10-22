import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { AppConfig } from './config/env.js';
import { getEnv } from './config/env.js';
import { createStore, type Store } from './db/store.js';
import { FirebaseAuthService } from './db/firebaseAuth.js';
import { correlationMiddleware, errorHandler } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { usersRouter, verificationsRouter } from './routes/users.js';
import { commentsRouter, contentRouter } from './routes/content.js';
import { appealsRouter, moderationRouter, reportsRouter } from './routes/moderation.js';
import { messagesRouter } from './routes/messages.js';
import { emailRouter } from './routes/email.js';
import { notificationsRouter } from './routes/notifications.js';
import { supportRouter } from './routes/support.js';
import { analyticsRouter } from './routes/analytics.js';
import { dashboardRouter, searchRouter } from './routes/dashboard.js';
import { adminsRouter, auditRouter, rolesRouter, securityRouter, settingsRouter, systemRouter } from './routes/admin.js';

export function createApp(storeOverride?: Store, cfgOverride?: AppConfig) {
  const cfg = cfgOverride ?? getEnv();
  const store = storeOverride ?? createStore(cfg);
  const fbAuth = new FirebaseAuthService(cfg);
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: cfg.WEB_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(correlationMiddleware);
  app.use((req, _res, next) => { req.store = store; req.cfg = cfg; next(); });

  const api = express.Router();
  api.use('/auth', authRouter(store, cfg));
  api.use('/dashboard', dashboardRouter(store, cfg));
  api.use('/search', searchRouter(store, cfg));
  api.use('/users', usersRouter(store, cfg, fbAuth));
  api.use('/verifications', verificationsRouter(store, cfg));
  api.use('/content', contentRouter(store, cfg));
  api.use('/comments', commentsRouter(store, cfg));
  api.use('/moderation', moderationRouter(store, cfg, fbAuth));
  api.use('/reports', reportsRouter(store, cfg));
  api.use('/appeals', appealsRouter(store, cfg, fbAuth));
  api.use('/messages', messagesRouter(store, cfg));
  api.use('/email', emailRouter(store, cfg));
  api.use('/notifications', notificationsRouter(store, cfg));
  api.use('/support', supportRouter(store, cfg));
  api.use('/analytics', analyticsRouter(store, cfg));
  api.use('/admins', adminsRouter(store, cfg));
  api.use('/roles', rolesRouter(store, cfg));
  api.use('/audit-logs', auditRouter(store, cfg));
  api.use('/settings', settingsRouter(store, cfg));
  api.use('/security', securityRouter(store, cfg));
  api.use('/system', systemRouter(store, cfg));
  app.use('/api/admin', api);

  // Public health at the contract path (also available un-prefixed for load balancers).
  app.get('/system/health/public', (_req, res) => res.json({ ok: true }));
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.use(errorHandler);
  return app;
}
