import type { RequestHandler } from './$types';
import { unsupportedRunSessionResponse } from '$lib/server/api-responses';

export const POST: RequestHandler = () => {
  return unsupportedRunSessionResponse();
};
