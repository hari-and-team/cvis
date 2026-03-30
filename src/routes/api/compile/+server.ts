import type { RequestHandler } from './$types';
import {
  backendUnavailableCompileResponse,
  unsupportedCompileResponse
} from '$lib/server/api-responses';
import { proxyExternalBackendRequest } from '$lib/server/external-backend';

export const POST: RequestHandler = async (event) => {
  try {
    const response = await proxyExternalBackendRequest(event, '/api/compile');
    return response ?? unsupportedCompileResponse();
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : undefined;
    return backendUnavailableCompileResponse(message);
  }
};
