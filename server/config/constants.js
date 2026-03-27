const PARSED_PORT = Number.parseInt(process.env.PORT || '3001', 10);

export const PORT = Number.isFinite(PARSED_PORT) ? PARSED_PORT : 3001;
export const JSON_BODY_LIMIT = '1mb';

export const DEV_CORS_ORIGINS = [
  'http://localhost:5173',
  'https://localhost:5173',
  'http://localhost:4173',
  'https://localhost:4173'
];

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
