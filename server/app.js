import cors from 'cors';
import express from 'express';
import { DEV_CORS_ORIGINS, JSON_BODY_LIMIT } from './config/constants.js';
import { getErrorMessage } from './lib/http/request-validation.js';
import { registerRoutes } from './routes/index.js';

function parseCorsOrigins(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return [];
  }

  return rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveAllowedOrigins() {
  const configured = parseCorsOrigins(process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '');
  const allowsAll = configured.includes('*');

  if (allowsAll) {
    return true;
  }

  if (process.env.NODE_ENV === 'production') {
    return configured;
  }

  return Array.from(new Set([...DEV_CORS_ORIGINS, ...configured]));
}

function createCorsOriginResolver() {
  const allowedOrigins = resolveAllowedOrigins();

  if (allowedOrigins === true) {
    return true;
  }

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  };
}

export function createApp() {
  const app = express();

  app.use(cors({
    origin: createCorsOriginResolver(),
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
