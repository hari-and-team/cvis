import { createApp } from './app.js';
import { PORT } from './config/constants.js';
import {
  getGccHealthDetails,
  getProjectCompilerLocations,
  verifyGcc
} from './lib/gcc-path.js';

const app = createApp();

function logStartupBanner(host, gccDetails) {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  C DSA Visualizer Backend Server');
  console.log('═══════════════════════════════════════════════');
  console.log('  Status:      Running');
  console.log(`  Environment: ${process.env.DOCKER_ENV ? 'Docker' : 'Local'}`);
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
    console.error(`  - Set CVIS_GCC_PATH to a dedicated gcc binary`);
    for (const location of getProjectCompilerLocations()) {
      console.error(`  - Place a project-local gcc at ${location}`);
    }
    console.error('  - Or use Docker Desktop with `docker compose up --build`');
    process.exit(1);
  }

  const gccDetails = await getGccHealthDetails();
  console.log(`✓ GCC found at: ${gccDetails.gcc}`);
  console.log(`✓ GCC source: ${gccDetails.gccSource}`);
  if (gccDetails.toolchainVersion) {
    console.log(`✓ Toolchain version: ${gccDetails.toolchainVersion}`);
  }

  const host = process.env.DOCKER_ENV ? '0.0.0.0' : 'localhost';
  const server = app.listen(PORT, host, () => {
    logStartupBanner(host, gccDetails);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Stop the running backend or use a different port.`);
      process.exit(1);
    }

    console.error('❌ Failed to start backend server:', err);
    process.exit(1);
  });
}

startServer();
