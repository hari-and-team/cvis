# C DSA Visualizer - Backend API

Express.js backend server that provides GCC compilation and execution endpoints for the C DSA Visualizer application.

## Features

- ✅ **Compile C Code**: Compile C source code using GCC
- ✅ **Execute Binaries**: Run compiled binaries with input/output capture
- ✅ **Trace Execution**: Deterministic line-by-line execution trace for visualization
- ✅ **AI Code Understanding**: Optional semantic code identification with OpenAI plus local heuristic fallback
- ✅ **Error Handling**: Comprehensive error messages and validation
- ✅ **Timeout Protection**: 5-10 second timeouts to prevent hanging
- ✅ **Auto Cleanup**: Automatic temp file cleanup after execution
- ✅ **Environment Detection**: Automatically detects Docker vs local GCC
- ✅ **Startup Validation**: Verifies GCC availability on startup

## Installation

```bash
cd server
npm install
```

Primary local setup now uses a repo-local bootstrap toolchain from the repo root:

```bash
npm run setup:toolchain
npm run doctor
npm run dev:all
```

Docker remains available as a fallback.

## Usage

### Start Server

```bash
npm start
# or
node index.js
```

The server will start on port 3001 and verify GCC is available.

### Production backend env

```bash
PORT=3001
BACKEND_HOST=127.0.0.1
FRONTEND_URL=https://your-frontend.example.com
# or multiple allowed browser origins:
CORS_ORIGINS=https://app.example.com,https://staging.example.com

# if TLS terminates at a reverse proxy
TRUST_PROXY=true
REQUIRE_HTTPS=true

# optional preview-origin support for Vercel frontend previews
# example:
# CORS_ORIGIN_REGEX=^https://your-frontend-.*\.vercel\.app$
CORS_ORIGIN_REGEX=

# direct TLS on the backend instead of proxy termination
TLS_KEY_FILE=/etc/ssl/private/cvis.key
TLS_CERT_FILE=/etc/ssl/certs/cvis.crt
# optional
TLS_CA_FILE=/etc/ssl/certs/ca-chain.crt
TLS_PASSPHRASE=change-me
HTTPS_PUBLIC_ORIGIN=https://api.example.com
```

If the frontend and backend are deployed behind the same reverse proxy, you can usually keep browser traffic same-origin by routing `/api` to the backend service.
The backend now sends API-focused security headers, supports direct HTTPS with TLS files, and can enforce HTTPS behind a trusted reverse proxy when `REQUIRE_HTTPS=true`.

### Vercel note

The backend can now be exposed through Vercel functions, but Vercel should be treated as a stateless runtime:

- `POST /api/execute`, `POST /api/trace`, and `POST /api/analyze/intent` are the safest fit
- live session endpoints (`/api/run/start`, `/api/run/poll`, `/api/run/input`, `/api/run/eof`, `/api/run/stop`) are disabled by default on Vercel because they depend on in-memory process state
- if you need the full interactive console, deploy the backend on a stateful Node/container host and keep `PUBLIC_EXECUTION_MODE=interactive` on the frontend

### Start in Docker (fallback)

From the repo root:

```bash
npm run docker:up:build
```

This starts both:
- frontend on `http://localhost:5173`
- backend on `http://localhost:3001`

The backend container includes GCC plus the runtime tools needed for interactive sessions (`stdbuf` and `script`).

### Run Tests

```bash
npm run test:backend
```

### Cross-platform verification

From the repo root:

```bash
npm run test:backend
```

That smoke test uses Node instead of Bash, so the same command works on Windows and Linux.

## Project-Scoped Compiler

The backend now prefers a compiler dedicated to this repo before falling back to the system-wide GCC.

The main onboarding path is:

```bash
npm run setup:toolchain
```

That downloads a pinned GCC bundle into `.cvis-toolchain/` and writes install metadata the backend can resolve directly.

Lookup order:

```bash
1. CVIS_GCC_PATH
2. server/toolchain/bin/gcc(.exe)
3. .cvis-toolchain/bin/gcc(.exe)
4. tools/gcc/bin/gcc(.exe)
5. system gcc
```

Examples:

```bash
CVIS_GCC_PATH=/absolute/path/to/gcc npm start
```

or place a dedicated compiler at:

```bash
server/toolchain/bin/gcc
```

On Windows, the same locations may use `gcc.exe`, or you can point directly at a dedicated compiler:

```powershell
$env:CVIS_GCC_PATH = "C:\toolchains\mingw64\bin\gcc.exe"
npm start
```

Current managed bootstrap targets:
- Windows x64
- Linux x64
- Linux arm64

Current macOS bootstrap status:
- not bundled yet
- use Xcode Command Line Tools or Docker for now

## API Endpoints

### Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "gcc": "/home/you/cvis/server/toolchain/bin/gcc",
  "gccSource": "project-local",
  "gccVersion": "gcc (xPack GNU Compiler Collection) 15.2.0",
  "toolchainVersion": "15.2.0-1"
}
```

### Compile C Code

```bash
POST /api/compile
Content-Type: application/json

{
  "code": "#include <stdio.h>\n\nint main() {\n    printf(\"Hello\\n\");\n    return 0;\n}\n",
  "language": "c"
}
```

Success Response:
```json
{
  "success": true,
  "binary": "/tmp/code_1234567890.out",
  "output": "Compiled successfully",
  "errors": [],
  "warnings": [],
  "compilationTime": 50
}
```

On Windows, the compiled binary path ends with `.exe` instead of `.out`.

Error Response:
```json
{
  "success": false,
  "errors": [
    "/tmp/code_123.c:4:5: error: expected ';' before 'return'"
  ],
  "warnings": [],
  "compilationTime": 12
}
```

### Execute Binary

```bash
POST /api/run
Content-Type: application/json

{
  "binaryPath": "/tmp/code_1234567890.out",
  "args": [],
  "input": ""
}
```

Response:
```json
{
  "stdout": "Hello\n",
  "stderr": "",
  "exitCode": 0,
  "executionTime": 3
}
```

Notes:
- `binaryPath` must point to a temporary binary generated by `POST /api/compile`.
- Windows uses `.exe` binaries; Linux and macOS use `.out`.
- `args` must be an array when provided.
- `input` must be a string when provided.

### Compile And Execute In One Request

```bash
POST /api/execute
Content-Type: application/json

{
  "code": "int main() { return 0; }",
  "args": [],
  "input": ""
}
```

Response:
```json
{
  "success": true,
  "compile": {
    "success": true,
    "output": "Compiled successfully",
    "errors": [],
    "warnings": [],
    "compilationTime": 32
  },
  "execution": {
    "stdout": "",
    "stderr": "",
    "exitCode": 0,
    "executionTime": 2
  }
}
```

This endpoint is recommended for stateless/serverless deployments because it avoids reusing a temporary binary path across requests.

### Trace Execution

```bash
POST /api/trace
Content-Type: application/json

{
  "code": "#include <stdio.h>\n\nint main() {\n    return 0;\n}\n",
  "breakpoints": [3, 4]
}
```

Response:
```json
{
  "success": true,
  "steps": [
    {
      "stepNumber": 1,
      "lineNo": 2,
      "registers": { "pc": 2, "sp": 4032, "fp": 4096 },
      "memory": {},
      "stackFrames": [{ "name": "global", "locals": {} }, { "name": "main", "locals": {} }],
      "runtime": {
        "globals": {},
        "frames": [{ "name": "main", "locals": {} }],
        "flatMemory": {}
      },
      "instructionPointer": "line:2",
      "timestamp": 1710000000001
    }
  ],
  "totalSteps": 1,
  "errors": []
}
```

Notes:
- Tracing is provided by `lib/c-interpreter.js`.
- `breakpoints` are optional and filter returned trace steps to matching line numbers.
- `steps[].runtime` is the preferred structured trace snapshot with separate `globals`, `frames`, and flattened `flatMemory`.
- `memory` and `stackFrames` are still returned for compatibility with older consumers.

## Configuration

- **Port**: 3001 (hardcoded)
- **CORS**: Enabled for `http://localhost:5173` and `http://localhost:4173` in development
- **Compile Timeout**: 10 seconds
- **Execution Timeout**: 5 seconds
- **Execution Output Limit**: 1 MB combined stdout/stderr
- **GCC Path**: Prefers a project-scoped compiler before falling back to system `gcc`
- **Managed Toolchain**: `.cvis-toolchain/install.json` plus the extracted toolchain under `.cvis-toolchain/toolchains/`
- **OpenAI Analysis**: `OPENAI_API_KEY` with `OPENAI_ANALYZE_MODEL` or `OPENAI_MODEL`, default `gpt-5-mini`

## Architecture

### Files

- `index.ts` - Server bootstrap and startup checks
- `app.ts` - Express app assembly (middleware + routes)
- `config/constants.js` - Shared limits and configuration
- `routes/index.ts` - Health + API route handlers
- `lib/gcc-path.js` - GCC discovery and startup verification
- `lib/compile-c.js` - Compilation service
- `lib/run-binary.js` - Binary execution service
- `lib/c-interpreter.js` - Interpreter-backed trace generation service
- `lib/http/request-validation.ts` - Request normalization/validation + error message helper
- `package.json` - Dependencies and scripts
- `../scripts/test-backend.mjs` - Cross-platform backend smoke test

### Temp File Management

- Source files: `/tmp/code_<timestamp>.c`
- Binaries: `/tmp/code_<timestamp>.out`
- Auto cleanup: Source files deleted after compilation, binaries after execution

### Error Handling

- Request validation (missing fields)
- GCC compilation errors
- Binary execution errors
- File system errors
- Timeout errors

## Requirements

- Node.js 16+
- GCC compiler
- Docker Desktop or Docker Engine + Compose v2 for the containerized path
- Linux/macOS for local host-GCC development
- Windows is supported through Docker Desktop for the most consistent path

## Future Enhancements

- [ ] GDB integration for real trace execution
- [ ] Support for multiple compilation flags
- [ ] Custom memory limits
- [ ] Multi-file project support
- [ ] Static analysis integration
