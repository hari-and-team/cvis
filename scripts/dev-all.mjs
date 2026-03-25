import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEffectiveGccSource, verifyGcc } from '../server/lib/gcc-path.js';

const BACKEND_HEALTH_URL = 'http://localhost:3001/health';
const HEALTH_TIMEOUT_MS = 1200;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_NODE_MODULES = path.join(PROJECT_ROOT, 'node_modules');
const SERVER_NODE_MODULES = path.join(PROJECT_ROOT, 'server', 'node_modules');

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      ...options
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} exited via signal ${signal}`));
        return;
      }

      if ((code ?? 0) !== 0) {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 1}`));
        return;
      }

      resolve();
    });
  });
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

async function ensureDependenciesInstalled() {
  if (!existsSync(ROOT_NODE_MODULES)) {
    console.log('ℹ️ First run detected: installing root dependencies...');
    await runCommand(npmCommand(), ['install'], { cwd: PROJECT_ROOT });
  }

  if (!existsSync(SERVER_NODE_MODULES)) {
    console.log('ℹ️ Installing backend dependencies...');
    await runCommand(npmCommand(), ['install'], { cwd: path.join(PROJECT_ROOT, 'server') });
  }
}

async function checkLocalCompilerReadiness() {
  const compilerReady = await verifyGcc();
  if (!compilerReady) {
    console.log('ℹ️ No working compiler detected. Bootstrapping the repo-local toolchain...');
    await runCommand(npmCommand(), ['run', 'setup:toolchain'], { cwd: PROJECT_ROOT });

    const compilerAvailableAfterSetup = await verifyGcc();
    if (!compilerAvailableAfterSetup) {
      console.error('✗ Toolchain bootstrap completed, but the backend still cannot find a working compiler.');
      console.error('  Run `npm run doctor` for a full local environment check.');
      process.exit(1);
    }
  }

  const source = getEffectiveGccSource();
  if (source !== 'project-local') {
    console.log(`ℹ️ Using ${source} compiler fallback for now.`);
    console.log('ℹ️ Recommended teammate-safe setup: `npm run setup:toolchain`');
  }
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
  await ensureDependenciesInstalled();
  console.log('ℹ️ Backend already running on http://localhost:3001. Starting frontend only.');
  console.log('ℹ️ Open: http://localhost:5173/');
  runNpmScript('dev');
} else {
  await ensureDependenciesInstalled();
  await checkLocalCompilerReadiness();
  console.log('ℹ️ Starting backend and frontend together.');
  runNpmScript('dev:stack');
}
