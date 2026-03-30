import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import type { ListenableAppLike } from './lib/http/http-types.ts';
import { createApp } from './app.ts';
import { PORT } from './config/constants.js';
import {
  getGccHealthDetails,
  getProjectCompilerLocations,
  verifyGcc
} from './lib/gcc-path.js';

const app = createApp() as ListenableAppLike;

export default app as never;

function parseBooleanEnv(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === 'true';
}

async function loadTlsOptions() {
  const keyFile = process.env.TLS_KEY_FILE?.trim();
  const certFile = process.env.TLS_CERT_FILE?.trim();
  const caFile = process.env.TLS_CA_FILE?.trim();

  if (!keyFile && !certFile && !caFile) {
    return null;
  }

  if (!keyFile || !certFile) {
    throw new Error('TLS_KEY_FILE and TLS_CERT_FILE must both be set to enable HTTPS.');
  }

  return {
    key: await readFile(keyFile),
    cert: await readFile(certFile),
    ca: caFile ? await readFile(caFile) : undefined,
    passphrase: process.env.TLS_PASSPHRASE?.trim() || undefined
  };
}

function logStartupBanner(
  protocol: 'http' | 'https',
  host: string,
  gccDetails: Awaited<ReturnType<typeof getGccHealthDetails>>
) {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  C DSA Visualizer Backend Server');
  console.log('═══════════════════════════════════════════════');
  console.log('  Status:      Running');
  console.log(`  Environment: ${process.env.DOCKER_ENV ? 'Docker' : 'Local'}`);
  console.log(`  Protocol:    ${protocol.toUpperCase()}`);
  console.log(`  Port:        ${PORT}`);
  console.log(`  Host:        ${host}`);
  console.log(`  GCC:         ${gccDetails.gcc}`);
  console.log(`  GCC Source:  ${gccDetails.gccSource}`);
  if (gccDetails.gccVersion) {
    console.log(`  GCC Version: ${gccDetails.gccVersion}`);
  }
  if (gccDetails.toolchainVersion) {
    console.log(`  Toolchain:   ${gccDetails.toolchainVersion}`);
  }
  console.log('');
  console.log('  Endpoints:');
  console.log('    POST /api/compile - Compile C code');
  console.log('    POST /api/run     - Execute binary');
  console.log('    POST /api/trace   - Trace execution');
  console.log('    GET  /health      - Health check');
  if (parseBooleanEnv('REQUIRE_HTTPS')) {
    console.log('  HTTPS:       enforced');
  }
  console.log('═══════════════════════════════════════════════');
  console.log('');
}

async function startServer() {
  console.log('Checking GCC availability...');
  const gccAvailable = await verifyGcc();

  if (!gccAvailable) {
    console.error('❌ ERROR: GCC is not available on this system!');
    console.error('This project prefers a dedicated repo-local compiler for cvis only.');
    console.error('Use one of these options:');
    console.error('  - Run `npm run setup:toolchain` from the repo root');
    console.error('  - Set CVIS_GCC_PATH to a dedicated gcc binary');
    for (const location of getProjectCompilerLocations()) {
      console.error(`  - Place a project-local gcc at ${location}`);
    }
    console.error('  - Or use Docker Desktop with `docker compose up --build`');
    process.exit(1);
  }

  const gccDetails = await getGccHealthDetails();
  const tlsOptions = await loadTlsOptions();
  console.log(`✓ GCC found at: ${gccDetails.gcc}`);
  console.log(`✓ GCC source: ${gccDetails.gccSource}`);
  if (gccDetails.toolchainVersion) {
    console.log(`✓ Toolchain version: ${gccDetails.toolchainVersion}`);
  }
  if (tlsOptions) {
    console.log('✓ HTTPS enabled with configured TLS certificate');
  } else if (parseBooleanEnv('REQUIRE_HTTPS')) {
    console.log('✓ HTTPS enforcement enabled for trusted proxy / reverse proxy deployments');
  }

  const host = process.env.BACKEND_HOST || (process.env.DOCKER_ENV ? '0.0.0.0' : 'localhost');
  const protocol = tlsOptions ? 'https' : 'http';
  const server = tlsOptions
    ? createHttpsServer(tlsOptions, app as never)
    : createHttpServer(app as never);

  server.listen(PORT, host, () => {
    logStartupBanner(protocol, host, gccDetails);
  });

  server.on('error', (err: NodeJS.ErrnoException | Error) => {
    if ('code' in err && err.code === 'EADDRINUSE') {
      console.error(
        `❌ Port ${PORT} is already in use. Stop the running backend or use a different port.`
      );
      process.exit(1);
    }

    console.error('❌ Failed to start backend server:', err);
    process.exit(1);
  });
}

if (!process.env.VERCEL) {
  void startServer();
}
