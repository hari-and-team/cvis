import type { RequestHandler } from './$types';
import {
  backendUnavailableRunSessionResponse,
  unsupportedRunSessionResponse
} from '$lib/server/api-responses';
import { proxyExternalBackendRequest } from '$lib/server/external-backend';

export const POST: RequestHandler = async (event) => {
  try {
    const response = await proxyExternalBackendRequest(event, '/api/run/stop');
    return response ?? unsupportedRunSessionResponse();
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : undefined;
    return backendUnavailableRunSessionResponse(message);
  }
};
