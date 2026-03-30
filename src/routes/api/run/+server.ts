import type { RequestHandler } from './$types';
import { backendUnavailableRunResponse, unsupportedRunResponse } from '$lib/server/api-responses';
import { proxyExternalBackendRequest } from '$lib/server/external-backend';

export const POST: RequestHandler = async (event) => {
  try {
    const response = await proxyExternalBackendRequest(event, '/api/run');
    return response ?? unsupportedRunResponse();
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : undefined;
    return backendUnavailableRunResponse(message);
  }
};
