import type { RequestHandler } from './$types';
import { apiJson, readJsonObject } from '$lib/server/api-responses';
import { analyzeProgramIntent } from '../../../../../server/lib/program-intent-ml.js';
import { getErrorMessage, validateCode } from '../../../../../server/lib/http/request-validation';
import {
  analyzeServerErrorResponse,
  analyzeValidationResponse
} from '../../../../../server/lib/http/route-responses';

export const POST: RequestHandler = async ({ request }) => {
  const bodyResult = await readJsonObject(request);
  if ('error' in bodyResult) {
    return apiJson(analyzeValidationResponse(bodyResult.error), { status: 400 });
  }

  const { code } = bodyResult.value;
  const codeError = validateCode(code);
  if (codeError) {
    return apiJson(analyzeValidationResponse(codeError), { status: 400 });
  }

  try {
    const result = await analyzeProgramIntent(code as string);
    return apiJson(result);
  } catch (error) {
    return apiJson(analyzeServerErrorResponse(getErrorMessage(error)), { status: 500 });
  }
};
