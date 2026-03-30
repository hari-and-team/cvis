import type { RequestEvent } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { normalizeApiBase } from '$lib/execution-mode';

const NO_STORE_CACHE_CONTROL = 'no-store, max-age=0';
const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type'] as const;

function buildBackendUrl(pathname: string): string | null {
  const apiBase = normalizeApiBase(publicEnv.PUBLIC_API_BASE);
  if (!apiBase) {
    return null;
  }

  return `${apiBase}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function copyRequestHeaders(source: Headers): Headers {
  const headers = new Headers();

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = source.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  return headers;
}

function buildResponseHeaders(source: Headers): Headers {
  const headers = new Headers({
    'Cache-Control': NO_STORE_CACHE_CONTROL
  });
  const contentType = source.get('content-type');

  if (contentType) {
    headers.set('content-type', contentType);
  }

  return headers;
}

function getRequestBody(request: Request, method: string): Promise<string | undefined> {
  if (method === 'GET' || method === 'HEAD') {
    return Promise.resolve(undefined);
  }

  return request.text().then((body) => (body.length > 0 ? body : undefined));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Unknown proxy error';
}

export async function proxyExternalBackendRequest(
  event: RequestEvent,
  pathname: string
): Promise<Response | null> {
  const backendUrl = buildBackendUrl(pathname);
  if (!backendUrl) {
    return null;
  }

  const method = event.request.method.toUpperCase();
  const headers = copyRequestHeaders(event.request.headers);
  const body = await getRequestBody(event.request, method);

  try {
    const upstream = await fetch(backendUrl, {
      method,
      headers,
      body
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: buildResponseHeaders(upstream.headers)
    });
  } catch (error) {
    throw new Error(`External execution backend request failed: ${getErrorMessage(error)}`);
  }
}
