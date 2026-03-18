# C DSA Visualizer - Backend API

Express.js backend server that provides GCC compilation and execution endpoints for the C DSA Visualizer application.

## Features

- ✅ **Compile C Code**: Compile C source code using GCC
- ✅ **Execute Binaries**: Run compiled binaries with input/output capture
- ✅ **Trace Execution**: Deterministic line-by-line execution trace for visualization
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

## Usage

### Start Server

```bash
npm start
# or
node index.js
```

The server will start on port 3001 and verify GCC is available.

### Run Tests

```bash
./test.sh
```

## API Endpoints

### Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "gcc": "/usr/bin/gcc"
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
  "output": "Compiled successfully to /tmp/code_1234567890.out",
  "errors": [],
  "warnings": [],
  "compilationTime": 50
}
```

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
      "registers": { "pc": 2, "sp": 4092, "acc": 0 },
      "memory": {},
      "instructionPointer": "line:2",
      "timestamp": 1710000000001
    }
  ],
  "totalSteps": 1,
  "errors": []
}
```

## Configuration

- **Port**: 3001 (hardcoded)
- **CORS**: Enabled for `http://localhost:5173` (Vite dev server)
- **Compile Timeout**: 10 seconds
- **Execution Timeout**: 5 seconds
- **GCC Path**: Auto-detected (`/usr/bin/gcc` or `gcc`)

## Architecture

### Files

- `index.js` - Express server with endpoints and middleware
- `lib/gcc-path.js` - GCC discovery and startup verification
- `lib/compile-c.js` - Compilation service
- `lib/run-binary.js` - Binary execution service
- `lib/trace-execution.js` - Deterministic trace generation service
- `package.json` - Dependencies and scripts
- `test.sh` - Test suite

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
- Linux/macOS/WSL (for `/tmp` directory)

## Future Enhancements

- [ ] GDB integration for real trace execution
- [ ] Support for multiple compilation flags
- [ ] Custom memory limits
- [ ] Multi-file project support
- [ ] Static analysis integration
