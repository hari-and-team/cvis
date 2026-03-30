import { getGccHealthDetails } from '../gcc-path.js';
import { compileC } from '../compile-c.js';
import { executeSource } from '../execute-source.js';
import { runBinary } from '../run-binary.js';
import {
  closeRunInput,
  pollRunSession,
  sendRunInput,
  startRunSession,
  stopRunSession
} from '../run-session.js';
import { traceExecution } from '../c-interpreter.js';
import { analyzeProgramIntent } from '../program-intent-ml.js';
import { runtimeCapabilities, supportsInteractiveRunSessions } from '../runtime-capabilities.js';
import type { RequestLike, ResponseLike } from './http-types.ts';
import {
  getErrorMessage,
  getLanguageLabel,
  normalizeArgs,
  normalizeBinaryPath,
  normalizeBreakpoints,
  normalizeInput,
  normalizeJsonBody,
  validateCode
} from './request-validation.ts';
import {
  analyzeServerErrorResponse,
  analyzeValidationResponse,
  compileServerErrorResponse,
  compileValidationResponse,
  runServerErrorResponse,
  runValidationResponse,
  traceServerErrorResponse,
  traceValidationResponse
} from './route-responses.ts';

function queryStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function healthHandler(req: RequestLike, res: ResponseLike) {
  const gcc = await getGccHealthDetails();
  const capabilities = runtimeCapabilities();
  const environment = process.env.VERCEL ? 'vercel' : process.env.DOCKER_ENV ? 'docker' : 'local';
  return res.json({
    status: 'ok',
    ...gcc,
    capabilities: {
      ...capabilities,
      nativeCompilationAvailable: Boolean(gcc.gccVersion)
    },
    requestProtocol: req.protocol ?? (req.secure ? 'https' : 'http'),
    httpsConfigured: Boolean(process.env.TLS_KEY_FILE && process.env.TLS_CERT_FILE),
    httpsRequired: process.env.REQUIRE_HTTPS === 'true',
    environment,
    timestamp: new Date().toISOString()
  });
}

export async function compileHandler(req: RequestLike, res: ResponseLike) {
  const bodyResult = normalizeJsonBody(req.body);
  if ('error' in bodyResult) {
    return res.status(400).json(compileValidationResponse(bodyResult.error));
  }

  const { code, language } = bodyResult.value;
  const codeError = validateCode(code);

  if (codeError) {
    return res.status(400).json(compileValidationResponse(codeError));
  }

  const sourceCode = code as string;

  const languageLabel = getLanguageLabel(language);
  console.log(`Compiling ${Buffer.byteLength(sourceCode, 'utf8')} bytes of ${languageLabel} code...`);

  try {
    const result = await compileC(sourceCode);

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
}

export async function executeHandler(req: RequestLike, res: ResponseLike) {
  const bodyResult = normalizeJsonBody(req.body);
  if ('error' in bodyResult) {
    return res.status(400).json(runValidationResponse(bodyResult.error));
  }

  const { code, args, input } = bodyResult.value;
  const codeError = validateCode(code);
  if (codeError) {
    return res.status(400).json(runValidationResponse(codeError, 'No code provided'));
  }

  const argsResult = normalizeArgs(args);
  if ('error' in argsResult) {
    return res.status(400).json(runValidationResponse(argsResult.error, 'Invalid args'));
  }

  const inputResult = normalizeInput(input);
  if ('error' in inputResult) {
    return res.status(400).json(runValidationResponse(inputResult.error, 'Invalid input'));
  }

  try {
    const result = await executeSource(code as string, argsResult.value, inputResult.value);
    return res.json(result);
  } catch (err) {
    console.error('Execute error:', err);
    return res.status(500).json(runServerErrorResponse(getErrorMessage(err)));
  }
}

export async function runHandler(req: RequestLike, res: ResponseLike) {
  const bodyResult = normalizeJsonBody(req.body);
  if ('error' in bodyResult) {
    return res.status(400).json(runValidationResponse(bodyResult.error));
  }

  const { binaryPath, args, input } = bodyResult.value;

  const binaryPathResult = normalizeBinaryPath(binaryPath);
  if ('error' in binaryPathResult) {
    return res.status(400).json(
      runValidationResponse(binaryPathResult.error, 'No binary path provided')
    );
  }

  const argsResult = normalizeArgs(args);
  if ('error' in argsResult) {
    return res.status(400).json(runValidationResponse(argsResult.error, 'Invalid args'));
  }

  const inputResult = normalizeInput(input);
  if ('error' in inputResult) {
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
}

export async function runStartHandler(req: RequestLike, res: ResponseLike) {
  if (!supportsInteractiveRunSessions()) {
    return res.status(501).json({
      success: false,
      error:
        'Interactive run sessions are disabled in this serverless deployment. Set PUBLIC_EXECUTION_MODE=serverless on the frontend to use stateless runs, or deploy the backend on a stateful Node host for live stdin.'
    });
  }

  const bodyResult = normalizeJsonBody(req.body);
  if ('error' in bodyResult) {
    return res.status(400).json({ success: false, error: bodyResult.error });
  }

  const { binaryPath, args } = bodyResult.value;
  const binaryPathResult = normalizeBinaryPath(binaryPath);
  if ('error' in binaryPathResult) {
    return res.status(400).json({ success: false, error: binaryPathResult.error });
  }

  const argsResult = normalizeArgs(args);
  if ('error' in argsResult) {
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
}

export function runPollHandler(req: RequestLike, res: ResponseLike) {
  if (!supportsInteractiveRunSessions()) {
    return res.status(501).json({
      success: false,
      error: 'Interactive run sessions are disabled in this serverless deployment.'
    });
  }

  const sessionId = queryStringValue(req.query?.sessionId);
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
}

export function runInputHandler(req: RequestLike, res: ResponseLike) {
  if (!supportsInteractiveRunSessions()) {
    return res.status(501).json({
      success: false,
      error: 'Interactive run sessions are disabled in this serverless deployment.'
    });
  }

  const bodyResult = normalizeJsonBody(req.body);
  if ('error' in bodyResult) {
    return res.status(400).json({ success: false, error: bodyResult.error });
  }

  const { sessionId, input } = bodyResult.value;
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return res.status(400).json({ success: false, error: 'sessionId is required' });
  }

  const inputResult = normalizeInput(input);
  if ('error' in inputResult) {
    return res.status(400).json({ success: false, error: inputResult.error });
  }

  const result = sendRunInput(sessionId, inputResult.value);
  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json(result);
}

export function runEofHandler(req: RequestLike, res: ResponseLike) {
  if (!supportsInteractiveRunSessions()) {
    return res.status(501).json({
      success: false,
      error: 'Interactive run sessions are disabled in this serverless deployment.'
    });
  }

  const bodyResult = normalizeJsonBody(req.body);
  if ('error' in bodyResult) {
    return res.status(400).json({ success: false, error: bodyResult.error });
  }

  const { sessionId } = bodyResult.value;
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return res.status(400).json({ success: false, error: 'sessionId is required' });
  }

  const result = closeRunInput(sessionId);
  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json(result);
}

export function runStopHandler(req: RequestLike, res: ResponseLike) {
  if (!supportsInteractiveRunSessions()) {
    return res.status(501).json({
      success: false,
      error: 'Interactive run sessions are disabled in this serverless deployment.'
    });
  }

  const bodyResult = normalizeJsonBody(req.body);
  if ('error' in bodyResult) {
    return res.status(400).json({ success: false, error: bodyResult.error });
  }

  const { sessionId } = bodyResult.value;
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return res.status(400).json({ success: false, error: 'sessionId is required' });
  }

  const result = stopRunSession(sessionId);
  if (!result.success) {
    return res.status(404).json(result);
  }

  return res.json(result);
}

export async function traceHandler(req: RequestLike, res: ResponseLike) {
  const bodyResult = normalizeJsonBody(req.body);
  if ('error' in bodyResult) {
    return res.status(400).json(traceValidationResponse(bodyResult.error));
  }

  const { code, breakpoints, input } = bodyResult.value;
  const codeError = validateCode(code);
  if (codeError) {
    return res.status(400).json(traceValidationResponse(codeError, 'No code provided'));
  }

  const sourceCode = code as string;

  const breakpointResult = normalizeBreakpoints(breakpoints);
  if ('error' in breakpointResult) {
    return res.status(400).json(traceValidationResponse(breakpointResult.error));
  }

  const inputResult = normalizeInput(input);
  if ('error' in inputResult) {
    return res
      .status(400)
      .json(traceValidationResponse(inputResult.error, 'Invalid trace input'));
  }

  const maxLine = sourceCode.split(/\r?\n/).length;
  const outOfRangeBreakpoint = breakpointResult.value.find((lineNo) => lineNo > maxLine);
  if (outOfRangeBreakpoint) {
    return res.status(400).json(
      traceValidationResponse(`"breakpoints" must be within the source line range 1-${maxLine}`)
    );
  }

  console.log(`Tracing code with ${breakpointResult.value.length} breakpoints...`);

  try {
    const result = await traceExecution(sourceCode, breakpointResult.value, inputResult.value);
    console.log(`✓ Trace complete: ${result.totalSteps} steps`);
    return res.json(result);
  } catch (err) {
    console.error('Trace error:', err);
    return res.status(500).json(traceServerErrorResponse(getErrorMessage(err)));
  }
}

export async function analyzeIntentHandler(req: RequestLike, res: ResponseLike) {
  const bodyResult = normalizeJsonBody(req.body);
  if ('error' in bodyResult) {
    return res.status(400).json(analyzeValidationResponse(bodyResult.error));
  }

  const { code } = bodyResult.value;
  const codeError = validateCode(code);
  if (codeError) {
    return res.status(400).json(analyzeValidationResponse(codeError));
  }

  const sourceCode = code as string;

  try {
    const result = await analyzeProgramIntent(sourceCode);
    return res.json(result);
  } catch (err) {
    console.error('Intent analysis error:', err);
    return res.status(500).json(analyzeServerErrorResponse(err));
  }
}
