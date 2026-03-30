import { DEV_CORS_ORIGINS } from '../../config/constants.js';
import type { NextLike, RequestLike, ResponseLike } from './http-types.ts';

type CorsSettings = {
  origin: boolean | string | string[];
  credentials: boolean;
};

type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const RATE_LIMIT_POLICIES: Array<{ match: RegExp; policy: RateLimitPolicy }> = [
  { match: /^\/health$/, policy: { limit: 240, windowMs: 60_000 } },
  { match: /^\/api\/compile$/, policy: { limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/run\/start$/, policy: { limit: 40, windowMs: 60_000 } },
  { match: /^\/api\/run\/poll$/, policy: { limit: 600, windowMs: 60_000 } },
  { match: /^\/api\/run\/(input|eof|stop)$/, policy: { limit: 240, windowMs: 60_000 } },
  { match: /^\/api\/run$/, policy: { limit: 60, windowMs: 60_000 } },
  { match: /^\/api\/trace$/, policy: { limit: 20, windowMs: 60_000 } },
  { match: /^\/api\/analyze\/intent$/, policy: { limit: 60, windowMs: 60_000 } }
];
const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicy = { limit: 120, windowMs: 60_000 };

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
let nextRateLimitPruneAt = 0;

function parseExplicitOrigins(): string[] {
  return (
    process.env.CORS_ORIGINS
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? []
  );
}

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

function resolveHost(req: RequestLike): string {
  const explicitHost = typeof req.hostname === 'string' && req.hostname.trim() ? req.hostname : '';
  if (explicitHost) {
    return explicitHost;
  }

  const rawHostHeader =
    typeof req.get === 'function'
      ? req.get('host')
      : typeof req.headers?.host === 'string'
        ? req.headers.host
        : '';

  return (rawHostHeader || '').split(':')[0].trim().toLowerCase();
}

function requestIsLocal(req: RequestLike): boolean {
  const host = resolveHost(req);
  if (host && isLocalHost(host)) {
    return true;
  }

  const ip = typeof req.ip === 'string' ? req.ip : '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function requestIsSecure(req: RequestLike): boolean {
  return req.secure === true || req.protocol === 'https';
}

function setHeader(res: ResponseLike, name: string, value: string): void {
  if (typeof res.header === 'function') {
    res.header(name, value);
    return;
  }

  res.setHeader?.(name, value);
}

function parseBooleanEnv(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === 'true';
}

function resolveHttpsRedirectOrigin(req: RequestLike): string | null {
  const explicitOrigin = process.env.HTTPS_PUBLIC_ORIGIN?.trim().replace(/\/$/, '');
  if (explicitOrigin) {
    return explicitOrigin;
  }

  const host =
    (typeof req.get === 'function' ? req.get('host') : undefined) ||
    (typeof req.headers?.host === 'string' ? req.headers.host : '');

  if (!host) {
    return null;
  }

  return `https://${host}`;
}

function getRateLimitPolicy(pathname: string): RateLimitPolicy {
  for (const entry of RATE_LIMIT_POLICIES) {
    if (entry.match.test(pathname)) {
      return entry.policy;
    }
  }

  return DEFAULT_RATE_LIMIT_POLICY;
}

function pruneRateLimitBuckets(now: number): void {
  if (now < nextRateLimitPruneAt) {
    return;
  }

  nextRateLimitPruneAt = now + 60_000;
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function resolveRateLimitKey(req: RequestLike): string {
  const ip = typeof req.ip === 'string' && req.ip.trim() ? req.ip : 'unknown';
  return `${ip}:${req.path}`;
}

export function resolveCorsSettings(): CorsSettings {
  const explicitOrigins = parseExplicitOrigins();

  if (explicitOrigins.includes('*')) {
    return {
      origin: true,
      credentials: false
    };
  }

  if (explicitOrigins.length > 0) {
    return {
      origin: explicitOrigins.length === 1 ? explicitOrigins[0] : explicitOrigins,
      credentials: true
    };
  }

  if (process.env.NODE_ENV === 'production') {
    const frontendUrl = process.env.FRONTEND_URL?.trim();
    return {
      origin: frontendUrl || false,
      credentials: Boolean(frontendUrl)
    };
  }

  return {
    origin: DEV_CORS_ORIGINS,
    credentials: true
  };
}

export function resolveTrustProxySetting(): boolean | number | string {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) {
    return false;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return raw;
}

export function securityHeadersMiddleware(req: RequestLike, res: ResponseLike, next: NextLike): void {
  setHeader(res, 'X-Content-Type-Options', 'nosniff');
  setHeader(res, 'X-Frame-Options', 'DENY');
  setHeader(res, 'Referrer-Policy', 'no-referrer');
  setHeader(res, 'Cross-Origin-Opener-Policy', 'same-origin');
  setHeader(res, 'Cross-Origin-Resource-Policy', 'same-site');
  setHeader(
    res,
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'
  );
  setHeader(res, 'Cache-Control', 'no-store, max-age=0');
  setHeader(res, 'Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");

  if (requestIsSecure(req) && !requestIsLocal(req)) {
    setHeader(res, 'Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}

export function httpsEnforcementMiddleware(req: RequestLike, res: ResponseLike, next: NextLike): void {
  if (!parseBooleanEnv('REQUIRE_HTTPS')) {
    next();
    return;
  }

  if (requestIsSecure(req) || requestIsLocal(req)) {
    next();
    return;
  }

  const redirectOrigin = resolveHttpsRedirectOrigin(req);
  const targetUrl = redirectOrigin ? `${redirectOrigin}${req.originalUrl ?? req.path}` : null;

  if ((req.method === 'GET' || req.method === 'HEAD') && targetUrl && typeof res.redirect === 'function') {
    res.redirect(308, targetUrl);
    return;
  }

  res.status(426).json({
    error: 'HTTPS required',
    message: 'This endpoint only accepts secure HTTPS requests.'
  });
}

export function rateLimitMiddleware(req: RequestLike, res: ResponseLike, next: NextLike): void {
  const now = Date.now();
  pruneRateLimitBuckets(now);

  const policy = getRateLimitPolicy(req.path);
  const key = resolveRateLimitKey(req);
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + policy.windowMs
    });
    next();
    return;
  }

  current.count += 1;
  if (current.count <= policy.limit) {
    next();
    return;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  setHeader(res, 'Retry-After', String(retryAfterSeconds));
  res.status(429).json({
    error: 'Too many requests',
    message: 'Rate limit exceeded for this endpoint. Please wait and try again.',
    retryAfterSeconds
  });
}
