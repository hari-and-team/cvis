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
- Optional AI-backed code identification and section understanding in the Analysis tab

---

## Architecture Guide

For a module-by-module map of the codebase, see `CODEBASE.md`.

---

## Development Setup

### Prerequisites
- Node.js 18+
- Optional fallback only:
  - Docker Desktop / Docker Engine with Compose v2
  - system GCC

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

### Option 1: Repo-Local Toolchain Mode (Recommended)

This is now the main teammate-safe setup. It keeps the compiler local to the repo instead of depending on system GCC or Docker.

**Usage:**

```bash
npm install
cd server && npm install && cd ..
npm run setup:toolchain
npm run doctor
npm run dev:all
```

If dependencies or the repo-local compiler are missing, `npm run dev:all` now bootstraps the missing pieces automatically on first run before starting the app.

**What happens:**
- the toolchain bootstrap downloads a pinned GCC bundle into `.cvis-toolchain/`
- the backend prefers that repo-local compiler automatically
- `npm run doctor` verifies Node, dependencies, compiler availability, and a real compile/run smoke test
- teammates on Windows and Linux do not need to install system GCC manually

**Current bootstrap targets:**
- Windows x64
- Linux x64
- Linux arm64

**Current macOS note:**
- bootstrap is not yet available on macOS
- use Xcode Command Line Tools or Docker on macOS for now

### Option 2: Docker Mode (Fallback for Consistency)

**Benefits:**
- ✅ No need to install GCC locally
- ✅ Consistent GCC version across all environments
- ✅ Self-contained shipping
- ✅ Frontend and backend both run in containers
- ✅ Works well with Docker Desktop on Windows

**Usage:**

```bash
# Build the containers
npm run docker:build
# OR: docker compose build

# Start the full stack
npm run docker:up:build
# OR: docker compose up --build

# Stop the stack
npm run docker:down
# OR: docker compose down
```

**What happens:**
- Frontend runs in Docker on `http://localhost:5173`
- Backend runs in Docker on `http://localhost:3001`
- GCC, `stdbuf`, and `script` are available inside the backend container
- Vite proxies `/api` to the backend service inside Docker
- File watching uses polling so code changes are picked up reliably on Windows-mounted volumes

**Windows quick start:**

```bash
# 1. Install Docker Desktop and start it
# 2. From the repo root:
npm run docker:up:build

# 3. Open:
http://localhost:5173
```

**Supported cross-platform paths:**
- Windows: Docker Desktop + `npm run docker:up:build`
- Linux: Docker or local GCC
- macOS: Docker or local GCC

If you want the same behavior across devices, use the Docker path on every machine.

---

### Option 3: Local Development Mode with System GCC (Fallback)

**Prerequisites:**
- GCC must be installed on your system
  - **Ubuntu/Debian:** `sudo apt-get install gcc`
  - **macOS:** `xcode-select --install`
  - **Windows:** Docker Desktop is recommended instead of host GCC

**Usage:**

```bash
# Single command: start backend + frontend together
npm run dev:all
# - Reuses existing backend on :3001 if already running
# - Installs missing root/backend dependencies on first run
# - Bootstraps the repo-local toolchain automatically if no compiler is available
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

### Project-Scoped GCC

The backend now prefers a project-local compiler first. The bootstrap flow writes install metadata into `.cvis-toolchain/`, and the backend resolves that compiler before falling back to system GCC.

Search order:

```bash
1. CVIS_GCC_PATH
2. server/toolchain/bin/gcc
3. .cvis-toolchain/bin/gcc
4. tools/gcc/bin/gcc
5. system gcc
```

Examples:

```bash
# Use a dedicated compiler path only for this repo
CVIS_GCC_PATH=/absolute/path/to/gcc npm run backend

# Or bootstrap the managed repo-local toolchain
npm run setup:toolchain
```

On Windows, the same project-local lookup also accepts `gcc.exe`, for example:

```powershell
$env:CVIS_GCC_PATH = "C:\toolchains\mingw64\bin\gcc.exe"
npm run backend
```

Compiled binaries use `.exe` on Windows and `.out` on Linux/macOS, so compile, run, and interactive sessions stay aligned across platforms.

The backend health response now reports:
- `gcc`
- `gccSource`
- `gccVersion`
- `toolchainVersion`

so you can verify which compiler is active.

### Optional: Enable AI Code Understanding

If you want the Analysis tab to use a real LLM for semantic code identification instead of only local heuristics, the backend now prefers a local Ollama model first:

```bash
OLLAMA_MODEL=mistral:7b
# optional overrides
OLLAMA_ANALYZE_MODEL=mistral:7b
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

If Ollama is not configured, the backend can still use OpenAI as a secondary provider:

```bash
OPENAI_API_KEY=your_key_here
# optional override
OPENAI_ANALYZE_MODEL=gpt-5-mini
```

Without either provider configured, the app falls back to the built-in local classifier automatically.

---

## Project Structure

```
cvis/
├── src/                      # SvelteKit frontend
│   ├── lib/
│   │   ├── components/       # Svelte components
│   │   ├── api.ts            # Backend API client
│   │   ├── stores.ts         # App state stores (editor/execution/visualizer)
│   │   ├── layout/run-actions.ts # Compile/run and trace orchestration
│   │   └── types.ts          # TypeScript interfaces
│   └── routes/               # SvelteKit routes
├── server/                   # Express backend
│   ├── index.js              # Server bootstrap/startup
│   ├── app.js                # Express app assembly
│   ├── config/               # Shared limits/config constants
│   ├── routes/index.js       # Health + API route handlers
│   ├── lib/                  # Compiler/execution/interpreter services
│   └── package.json          # Backend dependencies
├── docker-compose.yml        # Docker Compose configuration
├── CODEBASE.md               # Module ownership and navigation guide
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

Notes:
- `binaryPath` should be the value returned by `POST /api/compile`.
- `input` must be a string when provided.

### `POST /api/trace`
Trace execution using the built-in C interpreter.
Optional `breakpoints` can be provided to filter returned steps by source line.

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
  "steps": [
    {
      "stepNumber": 1,
      "lineNo": 3,
      "registers": { "pc": 3, "sp": 4032, "fp": 4096 },
      "memory": {},
      "stackFrames": [{ "name": "main", "locals": {} }],
      "instructionPointer": "line:3",
      "timestamp": 1710000000001
    }
  ],
  "totalSteps": 1,
  "errors": []
}
```

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "gcc": "/usr/bin/gcc",
  "environment": "docker",
  "timestamp": "2024-03-18T10:00:00.000Z"
}
```

---

## Code Quality

```bash
# JS lint + Svelte/TypeScript checks
npm run lint

# Svelte/TypeScript diagnostics only
npm run check

# Cross-platform backend API smoke test
npm run test:backend
```

---

## Docker Details

### How Backend Detects Environment

The backend automatically detects whether it's running in Docker or locally:

- **Docker mode:** `DOCKER_ENV=true` environment variable is set
  - GCC path: first available of `/usr/bin/gcc`, `/usr/local/bin/gcc`, `/bin/gcc`, or `gcc`
  - Listens on `0.0.0.0:3001` for external access

- **Local mode:** No `DOCKER_ENV` variable
  - GCC path: first available system `gcc`
  - Listens on `localhost:3001`

### Docker Services

- **Frontend:** `Dockerfile.frontend` using Node 20
- **Backend:** `server/Dockerfile` using `gcc:13-bookworm` + Node 20
- **Compose:** `docker-compose.yml` starts both services together for development

### Volume Mounts

For development, the following are mounted:
- `./:/app` - Frontend source for live reload inside the frontend container
- `frontend_node_modules` - Isolated frontend dependencies
- `./server:/app/server` - Hot reload backend code changes
- `backend_node_modules` - Isolated backend dependencies

---

## Testing the Backend

### Test compilation (Docker)
```bash
docker compose up -d backend
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

### Cross-platform backend smoke test
```bash
npm run test:backend
```

---

## Troubleshooting

### Docker not starting
- Ensure Docker is running: `docker ps`
- Check logs: `docker compose logs`
- Rebuild: `npm run docker:build`

### GCC not found (local mode)
- Install GCC (see prerequisites)
- Verify: `gcc --version`
- On Windows, prefer Docker Desktop instead of host GCC for the most reliable setup

### Port 3001 already in use
- Stop other services: `lsof -ti:3001 | xargs kill`
- Or change PORT in docker-compose.yml

### Backend not responding
- Check if backend is running: `curl http://localhost:3001/health`
- Check logs: `docker compose logs backend` (Docker) or check terminal (local)

---

## Next Steps

See [MIGRATION_SPEC.md](./MIGRATION_SPEC.md) for the full migration plan and technical details.

---

## License

MIT
