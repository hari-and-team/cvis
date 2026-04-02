import type { RequestHandler } from './$types';
import { apiJson, readJsonObject } from '$lib/server/api-responses';
import { traceExecution } from '../../../../server/lib/c-interpreter.js';
import {
  getErrorMessage,
  normalizeBreakpoints,
  normalizeInput,
  validateCode
} from '../../../../server/lib/http/request-validation';
import {
  traceServerErrorResponse,
  traceValidationResponse
} from '../../../../server/lib/http/route-responses';

export const config = {
  maxDuration: 60
};

export const POST: RequestHandler = async ({ request }) => {
  const bodyResult = await readJsonObject(request);
  if ('error' in bodyResult) {
    return apiJson(traceValidationResponse(bodyResult.error), { status: 400 });
  }

  const { code, breakpoints, input } = bodyResult.value;
  const codeError = validateCode(code);
  if (codeError) {
    return apiJson(traceValidationResponse(codeError, 'No code provided'), { status: 400 });
  }

  const sourceCode = code as string;
  const breakpointResult = normalizeBreakpoints(breakpoints);
  if ('error' in breakpointResult) {
    return apiJson(traceValidationResponse(breakpointResult.error), { status: 400 });
  }

  const inputResult = normalizeInput(input);
  if ('error' in inputResult) {
    return apiJson(traceValidationResponse(inputResult.error, 'Invalid trace input'), {
      status: 400
    });
  }

  const maxLine = sourceCode.split(/\r?\n/).length;
  const outOfRangeBreakpoint = breakpointResult.value.find((lineNo) => lineNo > maxLine);
  if (outOfRangeBreakpoint) {
    return apiJson(
      traceValidationResponse(`"breakpoints" must be within the source line range 1-${maxLine}`),
      { status: 400 }
    );
  }

  try {
    const result = await traceExecution(sourceCode, breakpointResult.value, inputResult.value);
    return apiJson(result);
  } catch (error) {
    return apiJson(traceServerErrorResponse(getErrorMessage(error)), { status: 500 });
  }
};
