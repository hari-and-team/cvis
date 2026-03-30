import type { RequestHandler } from './$types';
import { unsupportedRunResponse } from '$lib/server/api-responses';

export const POST: RequestHandler = () => {
  return unsupportedRunResponse();
};
