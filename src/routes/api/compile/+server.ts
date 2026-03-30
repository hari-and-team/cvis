import type { RequestHandler } from './$types';
import { unsupportedCompileResponse } from '$lib/server/api-responses';

export const POST: RequestHandler = () => {
  return unsupportedCompileResponse();
};
