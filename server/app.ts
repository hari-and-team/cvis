import cors from 'cors';
import express from 'express';
import { JSON_BODY_LIMIT } from './config/constants.js';
import type {
  ErrorRequestHandlerLike,
  ListenableAppLike,
  NextLike,
  RequestLike,
  ResponseLike
} from './lib/http/http-types.ts';
import { getErrorMessage } from './lib/http/request-validation.ts';
import {
  httpsEnforcementMiddleware,
  rateLimitMiddleware,
  resolveCorsSettings,
  resolveTrustProxySetting,
  securityHeadersMiddleware
} from './lib/http/security.ts';
import { registerRoutes } from './routes/index.ts';

export function createApp(): ListenableAppLike {
  const app = express();
  const corsSettings = resolveCorsSettings();

  app.disable('x-powered-by');
  app.set('trust proxy', resolveTrustProxySetting());
  app.use(
    cors({
      origin: corsSettings.origin,
      credentials: corsSettings.credentials
    })
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(securityHeadersMiddleware);
  app.use(httpsEnforcementMiddleware);
  app.use(rateLimitMiddleware);
  app.use((req: RequestLike, _res: ResponseLike, next: NextLike) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  registerRoutes(app as unknown as ListenableAppLike);

  app.use(((err: unknown, _req: RequestLike, res: ResponseLike, _next: NextLike) => {
    const entityError = err as { type?: string; status?: number } | null;
    if (
      entityError?.type === 'entity.parse.failed' ||
      (err instanceof SyntaxError && entityError?.status === 400 && 'body' in err)
    ) {
      return res.status(400).json({
        error: 'Invalid JSON body',
        message: 'Request body must be valid JSON.'
      });
    }

    if (entityError?.type === 'entity.too.large') {
      return res.status(413).json({
        error: 'Request body too large',
        message: `Request body exceeds the configured limit of ${JSON_BODY_LIMIT}.`
      });
    }

    console.error('Unhandled error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: getErrorMessage(err)
    });
  }) as ErrorRequestHandlerLike);

  app.use((req: RequestLike, res: ResponseLike) => {
    void req;
    return res.status(404).json({ error: 'Endpoint not found' });
  });

  return app as unknown as ListenableAppLike;
}
