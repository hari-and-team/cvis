#!/bin/bash
# Test script for C DSA Visualizer Backend API
# Tests all three endpoints: /api/compile, /api/run, /api/trace

set -e

API_BASE="http://localhost:3001"
TEMP_DIR="/tmp/cvis-test-$$"
mkdir -p "$TEMP_DIR"

echo "═══════════════════════════════════════════════"
echo "  Backend API Test Suite"
echo "═══════════════════════════════════════════════"
echo ""

# Test 1: Health check
echo "Test 1: Health check"
HEALTH=$(curl -s "$API_BASE/health")
echo "✓ Health: $HEALTH"
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
  echo "✓ Compilation successful"
else
  echo "✗ Compilation failed"
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
  echo "✓ Execution successful"
else
  echo "✗ Execution failed"
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
  echo "✓ Compilation correctly failed"
else
  echo "✗ Should have failed compilation"
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
  echo "✓ Trace endpoint working"
else
  echo "✗ Trace failed"
  exit 1
fi
HAS_RUNTIME=$(echo "$TRACE_RESULT" | python3 -c "import sys, json; body=json.load(sys.stdin); step=(body.get('steps') or [{}])[0]; runtime=step.get('runtime') or {}; ok=isinstance(runtime.get('globals'), dict) and isinstance(runtime.get('frames'), list) and isinstance(runtime.get('flatMemory'), dict); print(ok)")
if [ "$HAS_RUNTIME" = "True" ]; then
  echo "✓ Structured trace runtime snapshot present"
else
  echo "✗ Structured trace runtime snapshot missing"
  exit 1
fi
echo ""

# Test 6: AI intent analysis
echo "Test 6: AI intent analysis"
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
  echo "✓ AI intent analysis returned structured output"
else
  echo "✗ AI intent analysis output was incomplete"
  exit 1
fi
echo ""

# Test 7: Reject unsafe binary path
echo "Test 7: Reject unsafe binary path"
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
  echo "✓ Unsafe binary path correctly rejected"
else
  echo "✗ Unsafe binary path was not rejected"
  exit 1
fi
echo ""

# Cleanup
rm -rf "$TEMP_DIR"

echo "═══════════════════════════════════════════════"
echo "  All tests passed! ✓"
echo "═══════════════════════════════════════════════"
