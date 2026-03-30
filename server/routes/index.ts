import type { AppLike } from '../lib/http/http-types.ts';
import {
  analyzeIntentHandler,
  compileHandler,
  executeHandler,
  healthHandler,
  runEofHandler,
  runHandler,
  runInputHandler,
  runPollHandler,
  runStartHandler,
  runStopHandler,
  traceHandler
} from '../lib/http/route-handlers.ts';

export function registerRoutes(app: AppLike): void {
  app.get('/health', healthHandler);
  app.post('/api/compile', compileHandler);
  app.post('/api/execute', executeHandler);
  app.post('/api/run', runHandler);
  app.post('/api/run/start', runStartHandler);
  app.get('/api/run/poll', runPollHandler);
  app.post('/api/run/input', runInputHandler);
  app.post('/api/run/eof', runEofHandler);
  app.post('/api/run/stop', runStopHandler);
  app.post('/api/trace', traceHandler);
  app.post('/api/analyze/intent', analyzeIntentHandler);
}
