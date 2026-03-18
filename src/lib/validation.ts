function validateMainFunction(code: string): string | null {
  const hasMain = /\b(?:int|void)\s+main\s*\(/.test(code);
  if (!hasMain) {
    return 'Code must define a main() function before compile/trace.';
  }

  return null;
}

function validateCodeBody(code: string): string | null {
  if (!code || !code.trim()) {
    return 'Code cannot be empty.';
  }

  return validateMainFunction(code);
}

export function validateCompileRequest(code: string): string | null {
  return validateCodeBody(code);
}

export function validateTraceRequest(code: string): string | null {
  return validateCodeBody(code);
}
