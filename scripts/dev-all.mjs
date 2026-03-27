import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDevTlsCert } from './dev-cert.mjs';

const HEALTH_TIMEOUT_MS = 1200;
const DEV_BACKEND_HOST = '127.0.0.1';
const DEV_BACKEND_ORIGIN = `https://${DEV_BACKEND_HOST}:3001`;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_NODE_MODULES = path.join(PROJECT_ROOT, 'node_modules');
const SERVER_NODE_MODULES = path.join(PROJECT_ROOT, 'server', 'node_modules');
let gccPathModulePromise;

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function quoteWindowsArg(value) {
  if (!value) {
    return '""';
  }

  if (!/[\s"&()<>^|]/.test(value)) {
    return value;
  }

  return `"${value
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/g, '$1$1')}"`;
}

function spawnCommand(command, args, options = {}) {
  const spawnOptions = {
    stdio: 'inherit',
    env: process.env,
    ...options
  };

  if (process.platform !== 'win32') {
    return spawn(command, args, spawnOptions);
  }

  const commandLine = [command, ...args]
    .map((arg) => quoteWindowsArg(String(arg)))
    .join(' ');

  return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], spawnOptions);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, options);

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
  const child = spawnCommand(npmCommand(), ['run', scriptName]);

  child.on('error', (error) => {
    console.error(`Failed to start npm script "${scriptName}":`, error);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function loadGccPathModule() {
  if (!gccPathModulePromise) {
    gccPathModulePromise = import('../server/lib/gcc-path.js');
  }

  return gccPathModulePromise;
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
  const { getEffectiveGccSource, verifyGcc } = await loadGccPathModule();
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
  async function probe(origin) {
    return new Promise((resolve) => {
      const url = new URL(origin);
      const protocol = url.protocol === 'https:' ? 'https' : 'http';
      const client = protocol === 'https' ? https : http;
      const req = client.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: Number(url.port),
          path: '/health',
          method: 'GET',
          rejectUnauthorized: false,
          timeout: HEALTH_TIMEOUT_MS
        },
        (res) => {
          resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 500 ? origin : null);
          res.resume();
        }
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  }

  const preferredHttpsOrigin = await probe(DEV_BACKEND_ORIGIN);
  if (preferredHttpsOrigin) {
    return preferredHttpsOrigin;
  }

  const fallbackOrigins = [
    'https://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3001'
  ];

  for (const origin of fallbackOrigins) {
    const result = await probe(origin);
    if (result) {
      return result;
    }
  }

  return null;
}

const tls = await ensureDevTlsCert();
process.env.TLS_KEY_FILE = tls.keyPath;
process.env.TLS_CERT_FILE = tls.certPath;
process.env.BACKEND_HOST = DEV_BACKEND_HOST;
process.env.VITE_DEV_HTTPS = 'true';
process.env.VITE_DEV_HTTPS_KEY_FILE = tls.keyPath;
process.env.VITE_DEV_HTTPS_CERT_FILE = tls.certPath;
process.env.VITE_API_PROXY_TARGET = DEV_BACKEND_ORIGIN;

if (tls.created) {
  if (tls.source === 'mkcert') {
    console.log('ℹ️ Generated a locally trusted mkcert certificate for dev:all.');
  } else {
    console.log('ℹ️ Generated a self-signed HTTPS certificate for dev:all.');
  }
}

if (tls.trusted !== true) {
  console.log('ℹ️ Local HTTPS is active, but this certificate is not browser-trusted yet.');
  console.log('ℹ️ Install `mkcert` and rerun `npm run dev:all` to get a trusted localhost certificate.');
}

const backendProtocol = await isBackendRunning();

if (backendProtocol === DEV_BACKEND_ORIGIN) {
  await ensureDependenciesInstalled();
  console.log(`ℹ️ Backend already running on ${DEV_BACKEND_ORIGIN}. Starting HTTPS frontend only.`);
  console.log('ℹ️ Open: https://localhost:5173/');
  runNpmScript('dev');
} else {
  if (backendProtocol) {
    console.error(`✗ Backend is already running at ${backendProtocol}.`);
    console.error(`  Stop that process and rerun \`npm run dev:all\` so cvis can use the expected backend origin ${DEV_BACKEND_ORIGIN}.`);
    process.exit(1);
  }

  await ensureDependenciesInstalled();
  await checkLocalCompilerReadiness();
  console.log('ℹ️ Starting backend and frontend together over HTTPS.');
  console.log('ℹ️ Open: https://localhost:5173/');
  runNpmScript('dev:stack');
}
