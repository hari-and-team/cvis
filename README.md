# C DSA Visualizer

A web-based visualization tool for learning Data Structures and Algorithms in C.

## Tech Stack
- **Frontend:** SvelteKit + TypeScript + Tailwind CSS + Vite
- **Backend:** Express.js + Node.js
- **Compiler:** GCC (Docker-based or local)

## Features
- Interactive DSA visualization
- Real-time C code compilation and execution
- Server-side GCC compilation via Express backend
- Docker-based GCC environment for consistent cross-platform behavior
- Learning-friendly UI with syntax highlighting

---

## Development Setup

### Prerequisites
- Node.js 18+ (for SvelteKit and Express backend)
- **Option 1 (Recommended):** Docker & Docker Compose
- **Option 2:** Local GCC installation

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cvis
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd server && npm install && cd ..
   ```

---

## Running the Application

### Option 1: Docker Mode (Recommended for Production & Consistent Behavior)

**Benefits:**
- ✅ No need to install GCC locally
- ✅ Consistent GCC version across all environments
- ✅ Self-contained shipping
- ✅ Works identically on Linux, macOS, and Windows

**Usage:**

```bash
# Build the Docker container (first time only)
npm run docker:build
# OR: docker-compose build

# Start the backend in Docker
npm run docker:up
# OR: docker-compose up

# In a separate terminal, start the frontend
npm run dev

# Stop the backend
npm run docker:down
# OR: docker-compose down
```

**What happens:**
- Backend runs in a Docker container on port 3001
- GCC is available inside the container (gcc:13 from official Docker image)
- Node.js + Express backend handles compilation requests
- Volume mounts allow hot-reload during development

---

### Option 2: Local Development Mode (Faster for development if you have GCC)

**Prerequisites:**
- GCC must be installed on your system
  - **Ubuntu/Debian:** `sudo apt-get install gcc`
  - **macOS:** `xcode-select --install`
  - **Windows:** Install MinGW or use WSL

**Usage:**

```bash
# Single command: start backend + frontend together
npm run dev:all
# - Reuses existing backend on :3001 if already running
# - Always starts frontend and prints where to open it

# OR run them in separate terminals:
# Terminal 1: Start the backend locally
npm run backend
# OR: cd server && node index.js

# Terminal 2: Start the frontend
npm run dev
```

**What happens:**
- Backend runs directly on your machine on port 3001
- Uses your local GCC installation
- Faster startup compared to Docker
- Good for rapid development iteration

---

## Project Structure

```
cvis/
├── src/                      # SvelteKit frontend
│   ├── lib/
│   │   ├── components/       # Svelte components
│   │   ├── types.ts          # TypeScript interfaces
│   │   ├── api.ts            # Backend API client
│   │   └── stores.ts         # Svelte reactive stores
│   └── routes/               # SvelteKit routes
├── server/                   # Express backend
│   ├── Dockerfile            # Docker configuration
│   ├── index.js              # Express server and routes
│   ├── lib/                  # Modular backend services
│   │   ├── gcc-path.js        # GCC discovery/verification
│   │   ├── compile-c.js       # C compilation logic
│   │   ├── run-binary.js      # Binary execution logic
│   │   └── trace-execution.js # Deterministic trace generation
│   └── package.json          # Backend dependencies
├── docker-compose.yml        # Docker Compose configuration
├── .dockerignore             # Docker ignore rules
└── package.json              # Root package.json
```

---

## API Endpoints

The Express backend exposes the following endpoints on port 3001:

### `POST /api/compile`
Compile C code using GCC.

**Request:**
```json
{
  "code": "int main() { return 0; }"
}
```

**Response:**
```json
{
  "success": true,
  "binary": "/tmp/code_1234567890.out",
  "output": "Compiled successfully",
  "errors": [],
  "warnings": [],
  "compilationTime": 45
}
```

### `POST /api/run`
Execute a compiled binary.

**Request:**
```json
{
  "binaryPath": "/tmp/code_1234567890.out",
  "args": [],
  "input": ""
}
```

**Response:**
```json
{
  "stdout": "Hello World\n",
  "stderr": "",
  "exitCode": 0,
  "executionTime": 12
}
```

### `POST /api/trace`
Trace execution with breakpoints (future implementation).

**Request:**
```json
{
  "code": "int main() { return 0; }",
  "breakpoints": [3, 5]
}
```

**Response:**
```json
{
  "success": true,
  "steps": [],
  "totalSteps": 0,
  "errors": []
}
```

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "gcc": "/usr/local/bin/gcc",
  "environment": "docker",
  "timestamp": "2024-03-18T10:00:00.000Z"
}
```

---

## Docker Details

### How Backend Detects Environment

The backend automatically detects whether it's running in Docker or locally:

- **Docker mode:** `DOCKER_ENV=true` environment variable is set
  - GCC path: `/usr/local/bin/gcc` (from gcc:13 official image)
  - Listens on `0.0.0.0:3001` for external access

- **Local mode:** No `DOCKER_ENV` variable
  - GCC path: `/usr/bin/gcc` (Linux) or `gcc` (in PATH)
  - Listens on `localhost:3001`

### Docker Image

- **Base:** `gcc:13` (official GCC image with Debian)
- **Node.js:** Installed via NodeSource (v20 LTS)
- **Size:** ~1.5 GB (includes full GCC toolchain)
- **Build time:** ~2-3 minutes (first time)

### Volume Mounts

For development, the following are mounted:
- `./server:/app/server` - Hot reload server code changes
- `backend_node_modules` - Isolated node_modules volume

---

## Testing the Backend

### Test compilation (Docker)
```bash
docker-compose up -d
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"#include <stdio.h>\nint main() { printf(\"Hello\\n\"); return 0; }"}'
```

### Test compilation (Local)
```bash
npm run backend &
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"int main() { return 0; }"}'
```

### Health check
```bash
curl http://localhost:3001/health
```

---

## Troubleshooting

### Docker not starting
- Ensure Docker is running: `docker ps`
- Check logs: `docker-compose logs`
- Rebuild: `npm run docker:build`

### GCC not found (local mode)
- Install GCC (see prerequisites)
- Verify: `gcc --version`

### Port 3001 already in use
- Stop other services: `lsof -ti:3001 | xargs kill`
- Or change PORT in docker-compose.yml

### Backend not responding
- Check if backend is running: `curl http://localhost:3001/health`
- Check logs: `docker-compose logs backend` (Docker) or check terminal (local)

---

## Next Steps

See [MIGRATION_SPEC.md](./MIGRATION_SPEC.md) for the full migration plan and technical details.

---

## License

MIT
