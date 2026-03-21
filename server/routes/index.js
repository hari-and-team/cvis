import { getGccPath } from '../lib/gcc-path.js';
import { compileC } from '../lib/compile-c.js';
import { runBinary } from '../lib/run-binary.js';
import { traceExecution } from '../lib/c-interpreter.js';
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
    executionTime: 0
  };
}

function runServerErrorResponse(message) {
  return {
    exitCode: 1,
    stdout: '',
    stderr: message,
    executionTime: 0
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

export function registerRoutes(app) {
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      gcc: getGccPath(),
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

  app.post('/api/trace', async (req, res) => {
    const { code, breakpoints } = req.body;
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
      const result = await traceExecution(code, breakpointResult.value);
      console.log(`✓ Trace complete: ${result.totalSteps} steps`);
      return res.json(result);
    } catch (err) {
      console.error('Trace error:', err);
      return res.status(500).json(traceServerErrorResponse(getErrorMessage(err)));
    }
  });
}
