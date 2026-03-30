function parseBooleanEnv(name) {
  return process.env[name]?.trim().toLowerCase() === 'true';
}

export function isVercelRuntime() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION);
}

export function resolveExecutionMode() {
  const configured = process.env.CVIS_EXECUTION_MODE?.trim().toLowerCase();
  if (configured === 'serverless' || configured === 'stateless') {
    return 'serverless';
  }

  if (configured === 'interactive') {
    return 'interactive';
  }

  return isVercelRuntime() ? 'serverless' : 'interactive';
}

export function supportsInteractiveRunSessions() {
  if (parseBooleanEnv('ALLOW_SERVERLESS_RUN_SESSIONS')) {
    return true;
  }

  return resolveExecutionMode() !== 'serverless';
}

export function runtimeCapabilities() {
  const executionMode = resolveExecutionMode();

  return {
    executionMode,
    isVercelRuntime: isVercelRuntime(),
    supportsInteractiveRunSessions: supportsInteractiveRunSessions(),
    supportsStatelessExecution: true,
    supportsTracing: true,
    supportsIntentAnalysis: true
  };
}
