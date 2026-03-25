import { getGccHealthDetails } from '../lib/gcc-path.js';
import { compileC } from '../lib/compile-c.js';
import { runBinary } from '../lib/run-binary.js';
import {
  closeRunInput,
  pollRunSession,
  sendRunInput,
  startRunSession,
  stopRunSession
} from '../lib/run-session.js';
import { traceExecution } from '../lib/c-interpreter.js';
import { analyzeProgramIntent } from '../lib/program-intent-ml.js';
import {
  getErrorMessage,
  getLanguageLabel,
  normalizeArgs,
  normalizeBinaryPath,
  normalizeBreakpoints,
  normalizeInput,
  validateCode
} from '../lib/http/request-validation.js';

function compileValidationResponse(message) {
  return {
    success: false,
    error: 'Invalid compile request',
    errors: [message],
    warnings: [],
    compilationTime: 0
  };
}

function compileServerErrorResponse(message) {
  return {
    success: false,
    errors: [message],
    warnings: [],
    compilationTime: 0
  };
}

function runValidationResponse(message, error = 'Invalid run request') {
  return {
    error,
    stdout: '',
    stderr: message,
    exitCode: 1,
    executionTime: 0,
    peakMemoryBytes: null
  };
}

function runServerErrorResponse(message) {
  return {
    exitCode: 1,
    stdout: '',
    stderr: message,
    executionTime: 0,
    peakMemoryBytes: null
  };
}

function traceValidationResponse(message, error = 'Invalid trace request') {
  return {
    error,
    success: false,
    errors: [message],
    steps: [],
    totalSteps: 0
  };
}

function traceServerErrorResponse(message) {
  return {
    success: false,
    errors: [message],
    steps: [],
    totalSteps: 0
  };
}

function analyzeValidationResponse(message) {
  return {
    success: false,
    error: 'Invalid analyze request',
    source: 'heuristic',
    primaryIntent: 'generic',
    primaryLabel: 'Generic Algorithm',
    confidence: 0.35,
    matchedSignals: [],
    candidates: [],
    summary: 'The analyzer needs code before it can classify the program shape.',
    explanation: [message],
    sectionPurposes: [],
    optimizationIdeas: [],
    engine: 'validation-error',
    errors: [message]
  };
}

export function registerRoutes(app) {
  app.get('/health', async (_req, res) => {
    const gcc = await getGccHealthDetails();
    res.json({
      status: 'ok',
      ...gcc,
      environment: process.env.DOCKER_ENV ? 'docker' : 'local',
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/compile', async (req, res) => {
    const { code, language } = req.body;
    const codeError = validateCode(code);

    if (codeError) {
      return res.status(400).json(compileValidationResponse(codeError));
    }

    const languageLabel = getLanguageLabel(language);
    console.log(`Compiling ${Buffer.byteLength(code, 'utf8')} bytes of ${languageLabel} code...`);

    try {
      const result = await compileC(code);

      if (result.success) {
        console.log(`✓ Compilation successful in ${result.compilationTime}ms`);
      } else {
        console.log(`✗ Compilation failed: ${result.errors[0]}`);
      }

      return res.json(result);
    } catch (err) {
      console.error('Compilation error:', err);
      return res.status(500).json(compileServerErrorResponse(getErrorMessage(err)));
    }
  });

  app.post('/api/run', async (req, res) => {
    const { binaryPath, args, input } = req.body;

    const binaryPathResult = normalizeBinaryPath(binaryPath);
    if (binaryPathResult.error) {
      return res.status(400).json(runValidationResponse(binaryPathResult.error, 'No binary path provided'));
    }

    const argsResult = normalizeArgs(args);
    if (argsResult.error) {
      return res.status(400).json(runValidationResponse(argsResult.error, 'Invalid args'));
    }

    const inputResult = normalizeInput(input);
    if (inputResult.error) {
      return res.status(400).json(runValidationResponse(inputResult.error, 'Invalid input'));
    }

    console.log(`Executing binary: ${binaryPathResult.value}`);

    try {
      const result = await runBinary(binaryPathResult.value, argsResult.value, inputResult.value);

      if (result.exitCode === 0) {
        console.log(`✓ Execution successful in ${result.executionTime}ms`);
      } else {
        console.log(`✗ Execution failed with exit code ${result.exitCode}`);
      }

      return res.json(result);
    } catch (err) {
      console.error('Execution error:', err);
      return res.status(500).json(runServerErrorResponse(getErrorMessage(err)));
    }
  });

  app.post('/api/run/start', async (req, res) => {
    const { binaryPath, args } = req.body;

    const binaryPathResult = normalizeBinaryPath(binaryPath);
    if (binaryPathResult.error) {
      return res.status(400).json({ success: false, error: binaryPathResult.error });
    }

    const argsResult = normalizeArgs(args);
    if (argsResult.error) {
      return res.status(400).json({ success: false, error: argsResult.error });
    }

    try {
      const result = await startRunSession(binaryPathResult.value, argsResult.value);
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (err) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get('/api/run/poll', (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId query parameter is required' });
    }

    const result = pollRunSession(sessionId);
    if (!result.found) {
      return res.status(404).json({ success: false, error: result.error });
    }

    return res.json({
      success: true,
      sessionId: result.sessionId,
      status: result.status,
      output: result.output,
      stdout: result.stdout,
      stderr: result.stderr,
      done: result.done,
      exitCode: result.exitCode,
      executionTime: result.executionTime,
      peakMemoryBytes: result.peakMemoryBytes,
      inputClosed: result.inputClosed,
      timedOut: result.timedOut,
      outputLimitHit: result.outputLimitHit,
      stopRequested: result.stopRequested,
      completionReason: result.completionReason,
      exitSignal: result.exitSignal
    });
  });

  app.post('/api/run/input', (req, res) => {
    const { sessionId, input } = req.body;
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }

    const result = sendRunInput(sessionId, input);
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  app.post('/api/run/eof', (req, res) => {
    const { sessionId } = req.body;
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }

    const result = closeRunInput(sessionId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  app.post('/api/run/stop', (req, res) => {
    const { sessionId } = req.body;
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }

    const result = stopRunSession(sessionId);
    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json(result);
  });

  app.post('/api/trace', async (req, res) => {
    const { code, breakpoints, input } = req.body;
    const codeError = validateCode(code);

    if (codeError) {
      return res.status(400).json(traceValidationResponse(codeError, 'No code provided'));
    }

    const breakpointResult = normalizeBreakpoints(breakpoints);
    if (breakpointResult.error) {
      return res.status(400).json(traceValidationResponse(breakpointResult.error));
    }

    console.log(`Tracing code with ${breakpointResult.value.length} breakpoints...`);

    try {
      const result = await traceExecution(code, breakpointResult.value, typeof input === 'string' ? input : '');
      console.log(`✓ Trace complete: ${result.totalSteps} steps`);
      return res.json(result);
    } catch (err) {
      console.error('Trace error:', err);
      return res.status(500).json(traceServerErrorResponse(getErrorMessage(err)));
    }
  });

  app.post('/api/analyze/intent', async (req, res) => {
    const { code } = req.body;
    const codeError = validateCode(code);

    if (codeError) {
      return res.status(400).json(analyzeValidationResponse(codeError));
    }

    try {
      const result = await analyzeProgramIntent(code);
      return res.json(result);
    } catch (err) {
      console.error('Intent analysis error:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err),
        source: 'heuristic',
        primaryIntent: 'generic',
        primaryLabel: 'Generic Algorithm',
        confidence: 0.35,
        matchedSignals: [],
        candidates: [],
        summary: 'The analyzer hit a server error before it could classify the code.',
        explanation: [],
        sectionPurposes: [],
        optimizationIdeas: [],
        engine: 'server-error'
      });
    }
  });
}
