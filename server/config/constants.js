export const PORT = 3001;
export const JSON_BODY_LIMIT = '1mb';

export const DEV_CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

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
  timeoutMs: 5_000,
  outputBytes: 1024 * 1024
});
