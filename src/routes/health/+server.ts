import type { RequestHandler } from './$types';
import { apiJson, healthPayload } from '$lib/server/api-responses';

export const GET: RequestHandler = (event) => {
  return apiJson(healthPayload(event));
};
