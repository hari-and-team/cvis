import { createApp } from './app.js';
import { PORT } from './config/constants.js';
import { getGccPath, verifyGcc } from './lib/gcc-path.js';

const app = createApp();

function logStartupBanner(host, gccPath) {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  C DSA Visualizer Backend Server');
  console.log('═══════════════════════════════════════════════');
  console.log('  Status:      Running');
  console.log(`  Environment: ${process.env.DOCKER_ENV ? 'Docker' : 'Local'}`);
  console.log(`  Port:        ${PORT}`);
  console.log(`  Host:        ${host}`);
  console.log(`  GCC:         ${gccPath}`);
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
    console.error('Please install GCC:');
    console.error('  - Ubuntu/Debian: sudo apt-get install gcc');
    console.error('  - macOS: xcode-select --install');
    console.error('  - Windows: Install MinGW or WSL');
    process.exit(1);
  }

  const gccPath = getGccPath();
  console.log(`✓ GCC found at: ${gccPath}`);

  const host = process.env.DOCKER_ENV ? '0.0.0.0' : 'localhost';
  const server = app.listen(PORT, host, () => {
    logStartupBanner(host, gccPath);
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
