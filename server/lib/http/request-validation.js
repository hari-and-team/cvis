import { REQUEST_LIMITS } from '../../config/constants.js';

export function getErrorMessage(err, fallback = 'Internal server error') {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function validateCode(code) {
  if (typeof code !== 'string') {
    return 'Request body must contain a string "code" field';
  }

  if (!code.trim()) {
    return 'Code cannot be empty';
  }

  const codeBytes = Buffer.byteLength(code, 'utf8');
  if (codeBytes > REQUEST_LIMITS.codeBytes) {
    return `Code exceeds maximum allowed size of ${REQUEST_LIMITS.codeBytes} bytes`;
  }

  return null;
}

export function normalizeArgs(args) {
  if (args === undefined) {
    return { value: [] };
  }

  if (!Array.isArray(args)) {
    return { error: '"args" must be an array when provided' };
  }

  if (args.length > REQUEST_LIMITS.args) {
    return { error: `"args" cannot contain more than ${REQUEST_LIMITS.args} values` };
  }

  const normalized = args.map((arg) => {
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    return null;
  });

  if (normalized.some((arg) => arg === null)) {
    return { error: '"args" values must be string, number, or boolean' };
  }

  return { value: normalized };
}

export function normalizeInput(input) {
  if (input === undefined) {
    return { value: '' };
  }

  if (typeof input !== 'string') {
    return { error: '"input" must be a string when provided' };
  }

  const inputBytes = Buffer.byteLength(input, 'utf8');
  if (inputBytes > REQUEST_LIMITS.runInputBytes) {
    return { error: `"input" exceeds maximum allowed size of ${REQUEST_LIMITS.runInputBytes} bytes` };
  }

  return { value: input };
}

export function normalizeBreakpoints(breakpoints) {
  if (breakpoints === undefined) {
    return { value: [] };
  }

  if (!Array.isArray(breakpoints)) {
    return { error: '"breakpoints" must be an array of positive integers' };
  }

  if (breakpoints.length > REQUEST_LIMITS.breakpoints) {
    return { error: `"breakpoints" cannot contain more than ${REQUEST_LIMITS.breakpoints} values` };
  }

  if (breakpoints.some((lineNo) => !Number.isInteger(lineNo) || lineNo < 1)) {
    return { error: '"breakpoints" must contain only positive integers' };
  }

  return { value: [...new Set(breakpoints)] };
}

export function normalizeBinaryPath(binaryPath) {
  if (typeof binaryPath !== 'string' || !binaryPath.trim()) {
    return { error: 'Request body must contain a non-empty string "binaryPath" field' };
  }

  return { value: binaryPath.trim() };
}

export function getLanguageLabel(language) {
  return typeof language === 'string' && language.trim() ? language : 'C';
}
