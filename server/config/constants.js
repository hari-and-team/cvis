const PARSED_PORT = Number.parseInt(process.env.PORT || '3001', 10);

export const PORT = Number.isFinite(PARSED_PORT) ? PARSED_PORT : 3001;
export const JSON_BODY_LIMIT = '1mb';

const DEV_CORS_HOSTS = ['localhost', '127.0.0.1', 'vite.localhost'];
const DEV_CORS_PORTS = [4173, 4174, 5173, 5174];
const DEV_CORS_PROTOCOLS = ['http', 'https'];

export const DEV_CORS_ORIGINS = DEV_CORS_PROTOCOLS.flatMap((protocol) =>
  DEV_CORS_HOSTS.flatMap((host) => DEV_CORS_PORTS.map((port) => `${protocol}://${host}:${port}`))
);

export const REQUEST_LIMITS = Object.freeze({
  codeBytes: 200_000,
  runInputBytes: 100_000,
  breakpoints: 2000,
  args: 32
});

export const COMPILATION_LIMITS = Object.freeze({
  timeoutMs: 10_000
});

export const EXECUTION_LIMITS = Object.freeze({
  timeoutMs: 120_000,
  outputBytes: 1024 * 1024,
  sessionRetentionMs: 60_000,
  maxSessions: 25
});
