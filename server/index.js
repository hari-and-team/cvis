import express from 'express';
import cors from 'cors';
import { getGccPath, verifyGcc } from './lib/gcc-path.js';
import { compileC } from './lib/compile-c.js';
import { runBinary } from './lib/run-binary.js';
import { traceExecution } from './lib/trace-execution.js';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:5173', 'http://localhost:4173'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    gcc: getGccPath(),
    environment: process.env.DOCKER_ENV ? 'docker' : 'local',
    timestamp: new Date().toISOString()
  });
});

// POST /api/compile - Compile C code
app.post('/api/compile', async (req, res) => {
  const { code, language } = req.body;
  
  if (!code) {
    return res.status(400).json({ 
      success: false,
      error: 'No code provided',
      errors: ['Request body must contain "code" field'],
      warnings: [],
      compilationTime: 0
    });
  }
  
  console.log(`Compiling ${code.length} bytes of ${language || 'C'} code...`);
  
  try {
    const result = await compileC(code);
    
    if (result.success) {
      console.log(`✓ Compilation successful in ${result.compilationTime}ms`);
    } else {
      console.log(`✗ Compilation failed: ${result.errors[0]}`);
    }
    
    res.json(result);
  } catch (err) {
    console.error('Compilation error:', err);
    res.status(500).json({ 
      success: false, 
      errors: [err.message || 'Internal server error'],
      warnings: [],
      compilationTime: 0
    });
  }
});

// POST /api/run - Execute compiled binary
app.post('/api/run', async (req, res) => {
  const { binaryPath, args, input } = req.body;
  
  if (!binaryPath) {
    return res.status(400).json({ 
      error: 'No binary path provided',
      stdout: '',
      stderr: 'Request body must contain "binaryPath" field',
      exitCode: 1,
      executionTime: 0
    });
  }
  
  console.log(`Executing binary: ${binaryPath}`);
  
  try {
    const result = await runBinary(binaryPath, args, input);
    
    if (result.exitCode === 0) {
      console.log(`✓ Execution successful in ${result.executionTime}ms`);
    } else {
      console.log(`✗ Execution failed with exit code ${result.exitCode}`);
    }
    
    res.json(result);
  } catch (err) {
    console.error('Execution error:', err);
    res.status(500).json({ 
      exitCode: 1, 
      stdout: '', 
      stderr: err.message || 'Internal server error',
      executionTime: 0
    });
  }
});

// POST /api/trace - Trace C code execution with breakpoints
app.post('/api/trace', async (req, res) => {
  const { code, breakpoints } = req.body;
  
  if (!code) {
    return res.status(400).json({ 
      error: 'No code provided',
      success: false,
      errors: ['Request body must contain "code" field'],
      steps: [],
      totalSteps: 0
    });
  }
  
  console.log(`Tracing code with ${breakpoints?.length || 0} breakpoints...`);
  
  try {
    const result = await traceExecution(code, breakpoints || []);
    
    console.log(`✓ Trace complete: ${result.totalSteps} steps`);
    
    res.json(result);
  } catch (err) {
    console.error('Trace error:', err);
    res.status(500).json({ 
      success: false, 
      errors: [err.message || 'Internal server error'], 
      steps: [],
      totalSteps: 0
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Startup
async function startServer() {
  // Verify GCC is available
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
  
  // Start listening - bind to 0.0.0.0 in Docker for external access
  const host = process.env.DOCKER_ENV ? '0.0.0.0' : 'localhost';
  
  const server = app.listen(PORT, host, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  C DSA Visualizer Backend Server');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Status:      Running`);
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
