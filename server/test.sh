#!/bin/bash
# Test script for C DSA Visualizer Backend API
# Tests all three endpoints: /api/compile, /api/run, /api/trace

set -e

API_BASE="http://localhost:3001"
TEMP_DIR="/tmp/cvis-test-$$"
mkdir -p "$TEMP_DIR"

echo "==============================================="
echo "  Backend API Test Suite"
echo "==============================================="
echo ""

# Test 1: Health check
echo "Test 1: Health check"
HEALTH=$(curl -s "$API_BASE/health")
echo "OK Health: $HEALTH"
echo ""

# Test 2: Compile valid C code
echo "Test 2: Compile valid C code"
cat > "$TEMP_DIR/valid.json" << 'EOF'
{
  "code": "#include <stdio.h>\n\nint main() {\n    printf(\"Hello World!\\n\");\n    return 0;\n}\n"
}
EOF
COMPILE_RESULT=$(curl -s -X POST "$API_BASE/api/compile" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/valid.json")
echo "$COMPILE_RESULT" | python3 -m json.tool
SUCCESS=$(echo "$COMPILE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")
if [ "$SUCCESS" = "True" ]; then
  echo "OK Compilation successful"
else
  echo "FAIL Compilation failed"
  exit 1
fi
echo ""

# Test 3: Run compiled binary
echo "Test 3: Run compiled binary"
BINARY_PATH=$(echo "$COMPILE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('binary', ''))")
cat > "$TEMP_DIR/run.json" << EOF
{
  "binaryPath": "$BINARY_PATH"
}
EOF
RUN_RESULT=$(curl -s -X POST "$API_BASE/api/run" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/run.json")
echo "$RUN_RESULT" | python3 -m json.tool
EXIT_CODE=$(echo "$RUN_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('exitCode', 1))")
if [ "$EXIT_CODE" = "0" ]; then
  echo "OK Execution successful"
else
  echo "FAIL Execution failed"
  exit 1
fi
echo ""

# Test 4: Compile invalid C code
echo "Test 4: Compile invalid C code (should fail)"
cat > "$TEMP_DIR/invalid.json" << 'EOF'
{
  "code": "#include <stdio.h>\n\nint main() {\n    printf(\"Missing semicolon\")\n    return 0;\n}\n"
}
EOF
INVALID_RESULT=$(curl -s -X POST "$API_BASE/api/compile" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/invalid.json")
echo "$INVALID_RESULT" | python3 -m json.tool
SUCCESS=$(echo "$INVALID_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', True))")
if [ "$SUCCESS" = "False" ]; then
  echo "OK Compilation correctly failed"
else
  echo "FAIL Should have failed compilation"
  exit 1
fi
echo ""

# Test 5: Trace execution (interpreter)
echo "Test 5: Trace execution"
cat > "$TEMP_DIR/trace.json" << 'EOF'
{
  "code": "#include <stdio.h>\n\nint main() {\n    int x = 10;\n    return 0;\n}\n",
  "breakpoints": [4]
}
EOF
TRACE_RESULT=$(curl -s -X POST "$API_BASE/api/trace" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/trace.json")
echo "$TRACE_RESULT" | python3 -m json.tool
SUCCESS=$(echo "$TRACE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")
if [ "$SUCCESS" = "True" ]; then
  echo "OK Trace endpoint working"
else
  echo "FAIL Trace failed"
  exit 1
fi
HAS_RUNTIME=$(echo "$TRACE_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); step=(body.get('steps') or [{}])[0]; runtime=step.get('runtime') or {}; ok=isinstance(runtime.get('globals'), dict) and isinstance(runtime.get('frames'), list) and isinstance(runtime.get('flatMemory'), dict); print(ok)")
if [ "$HAS_RUNTIME" = "True" ]; then
  echo "OK Structured trace runtime snapshot present"
else
  echo "FAIL Structured trace runtime snapshot missing"
  exit 1
fi
echo ""

# Test 6: Trace stdin happy path
echo "Test 6: Trace stdin happy path"
cat > "$TEMP_DIR/trace-stdin.json" << 'EOF'
{
  "code": "int main() {\n  int x = 0;\n  scanf(\"%d\", &x);\n  return x;\n}\n",
  "input": "42\n",
  "breakpoints": [4]
}
EOF
TRACE_STDIN_RESULT=$(curl -s -X POST "$API_BASE/api/trace" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/trace-stdin.json")
echo "$TRACE_STDIN_RESULT" | python3 -m json.tool
TRACE_STDIN_SUCCESS=$(echo "$TRACE_STDIN_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); print(body.get('success', False))")
TRACE_STDIN_VALUE=$(echo "$TRACE_STDIN_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); steps=body.get('steps') or []; frames=((steps[0] if steps else {}).get('runtime') or {}).get('frames') or []; locals_=(frames[0] if frames else {}).get('locals') or {}; print(locals_.get('x', ''))")
if [ "$TRACE_STDIN_SUCCESS" = "True" ] && [ "$TRACE_STDIN_VALUE" = "42" ]; then
  echo "OK Trace stdin is applied to runtime state"
else
  echo "FAIL Trace stdin did not reach runtime state"
  exit 1
fi
echo ""

echo "Test 7: Reject invalid trace input type"
TRACE_BAD_INPUT_RESULT=$(curl -s -X POST "$API_BASE/api/trace" \
  -H "Content-Type: application/json" \
  -d '{"code":"int main() { return 0; }\n","input":123}')
echo "$TRACE_BAD_INPUT_RESULT" | python3 -m json.tool
TRACE_BAD_INPUT_ERROR=$(echo "$TRACE_BAD_INPUT_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); errs=body.get('errors') or []; print(errs[0] if errs else '')")
if [ "$TRACE_BAD_INPUT_ERROR" = "\"input\" must be a string when provided" ]; then
  echo "OK Invalid trace input is rejected cleanly"
else
  echo "FAIL Invalid trace input was not handled cleanly"
  exit 1
fi
echo ""

echo "Test 8: Trace supports switch/case execution"
cat > "$TEMP_DIR/trace-switch.json" << 'EOF'
{
  "code": "#include <stdio.h>\nint main() {\n  int x = 2;\n  int y = 0;\n  switch (x) {\n    case 1:\n      y = 10;\n      break;\n    case 2:\n      y = 20;\n      break;\n    default:\n      y = 30;\n  }\n  return y;\n}\n"
}
EOF
TRACE_SWITCH_RESULT=$(curl -s -X POST "$API_BASE/api/trace" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/trace-switch.json")
echo "$TRACE_SWITCH_RESULT" | python3 -m json.tool
TRACE_SWITCH_SUCCESS=$(echo "$TRACE_SWITCH_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); print(body.get('success', False))")
TRACE_SWITCH_VALUE=$(echo "$TRACE_SWITCH_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); steps=body.get('steps') or []; frames=((steps[-1] if steps else {}).get('runtime') or {}).get('frames') or []; locals_=(frames[0] if frames else {}).get('locals') or {}; print(locals_.get('y', ''))")
if [ "$TRACE_SWITCH_SUCCESS" = "True" ] && [ "$TRACE_SWITCH_VALUE" = "20" ]; then
  echo "OK Switch/case trace follows the matching branch"
else
  echo "FAIL Switch/case trace did not produce the expected branch state"
  exit 1
fi
echo ""

echo "Test 9: Trace stops runaway loops cleanly"
cat > "$TEMP_DIR/trace-runaway.json" << 'EOF'
{
  "code": "int main() {\n  while (1) {\n  }\n  return 0;\n}\n"
}
EOF
TRACE_RUNAWAY_RESULT=$(curl -s -X POST "$API_BASE/api/trace" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/trace-runaway.json")
echo "$TRACE_RUNAWAY_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); print(json.dumps({'success': body.get('success'), 'totalSteps': body.get('totalSteps'), 'errors': body.get('errors'), 'phase': body.get('phase')}, indent=4))"
TRACE_RUNAWAY_SUCCESS=$(echo "$TRACE_RUNAWAY_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); print(body.get('success', True))")
TRACE_RUNAWAY_CLEAR=$(echo "$TRACE_RUNAWAY_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); errs=body.get('errors') or []; print(bool(errs) and 'maximum step limit' in errs[0])")
if [ "$TRACE_RUNAWAY_SUCCESS" = "False" ] && [ "$TRACE_RUNAWAY_CLEAR" = "True" ]; then
  echo "OK Runaway loops return a controlled step-limit error"
else
  echo "FAIL Runaway loop trace was not handled cleanly"
  exit 1
fi
echo ""

echo "Test 10: AI intent analysis"
cat > "$TEMP_DIR/analyze.json" << 'EOF'
{
  "code": "#include <stdio.h>\n\nint binary_search(int *arr, int n, int target) {\n    int low = 0;\n    int high = n - 1;\n    while (low <= high) {\n        int mid = low + (high - low) / 2;\n        if (arr[mid] == target) return mid;\n        if (arr[mid] < target) low = mid + 1;\n        else high = mid - 1;\n    }\n    return -1;\n}\n"
}
EOF
ANALYZE_RESULT=$(curl -s -X POST "$API_BASE/api/analyze/intent" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/analyze.json")
echo "$ANALYZE_RESULT" | python3 -m json.tool
ANALYZE_SUCCESS=$(echo "$ANALYZE_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); print(body.get('success', False))")
ANALYZE_HAS_SUMMARY=$(echo "$ANALYZE_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); print(isinstance(body.get('summary'), str) and isinstance(body.get('explanation'), list) and isinstance(body.get('candidates'), list))")
if [ "$ANALYZE_SUCCESS" = "True" ] && [ "$ANALYZE_HAS_SUMMARY" = "True" ]; then
  echo "OK AI intent analysis returned structured output"
else
  echo "FAIL AI intent analysis output was incomplete"
  exit 1
fi
echo ""

# Test 11: Reject unsafe binary path
echo "Test 11: Reject unsafe binary path"
cat > "$TEMP_DIR/unsafe-run.json" << 'EOF'
{
  "binaryPath": "/bin/ls",
  "args": [],
  "input": ""
}
EOF
UNSAFE_RESULT=$(curl -s -X POST "$API_BASE/api/run" \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/unsafe-run.json")
echo "$UNSAFE_RESULT" | python3 -m json.tool
UNSAFE_EXIT=$(echo "$UNSAFE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('exitCode', 0))")
if [ "$UNSAFE_EXIT" = "126" ]; then
  echo "OK Unsafe binary path correctly rejected"
else
  echo "FAIL Unsafe binary path was not rejected"
  exit 1
fi
echo ""

# Cleanup
rm -rf "$TEMP_DIR"

echo "==============================================="
echo "  All tests passed!"
echo "==============================================="
