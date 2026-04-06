import type { RequestHandler } from './$types';
import { apiJson, readJsonObject } from '$lib/server/api-responses';
import { assessTraceReadiness } from '../../../../../server/lib/c-interpreter.js';
import { getErrorMessage, validateCode } from '../../../../../server/lib/http/request-validation';
import {
  traceServerErrorResponse,
  traceValidationResponse
} from '../../../../../server/lib/http/route-responses';

export const POST: RequestHandler = async ({ request }) => {
  const bodyResult = await readJsonObject(request);
  if ('error' in bodyResult) {
    return apiJson(traceValidationResponse(bodyResult.error), { status: 400 });
  }

  const { code } = bodyResult.value;
  const codeError = validateCode(code);
  if (codeError) {
    return apiJson(traceValidationResponse(codeError, 'No code provided'), { status: 400 });
  }

  try {
    return apiJson(assessTraceReadiness(code as string));
  } catch (error) {
    return apiJson(traceServerErrorResponse(getErrorMessage(error)), { status: 500 });
  }
};
