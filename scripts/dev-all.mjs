import { spawn } from 'node:child_process';

const BACKEND_HEALTH_URL = 'http://localhost:3001/health';
const HEALTH_TIMEOUT_MS = 1200;

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runNpmScript(scriptName) {
  const child = spawn(npmCommand(), ['run', scriptName], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

async function isBackendRunning() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch(BACKEND_HEALTH_URL, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const backendRunning = await isBackendRunning();

if (backendRunning) {
  console.log('ℹ️ Backend already running on http://localhost:3001. Starting frontend only.');
  console.log('ℹ️ Open: http://localhost:5173/');
  runNpmScript('dev');
} else {
  console.log('ℹ️ Starting backend and frontend together.');
  runNpmScript('dev:stack');
}
