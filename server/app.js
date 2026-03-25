import cors from 'cors';
import express from 'express';
import { DEV_CORS_ORIGINS, JSON_BODY_LIMIT } from './config/constants.js';
import { getErrorMessage } from './lib/http/request-validation.js';
import { registerRoutes } from './routes/index.js';

function resolveCorsOrigin() {
  if (process.env.NODE_ENV === 'production') {
    return process.env.FRONTEND_URL;
  }

  return DEV_CORS_ORIGINS;
}

export function createApp() {
  const app = express();

  app.use(cors({
    origin: resolveCorsOrigin(),
    credentials: true
  }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  registerRoutes(app);

  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error', message: getErrorMessage(err) });
  });

  return app;
}
