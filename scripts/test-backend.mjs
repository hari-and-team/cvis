const API_BASE = process.env.CVIS_API_BASE ?? 'http://localhost:3001';

function log(message = '') {
  console.log(message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();

  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON from ${url}, received:\n${text}`);
  }

  return { res, body };
}

async function main() {
  log('═══════════════════════════════════════════════');
  log('  Backend API Test Suite');
  log('═══════════════════════════════════════════════');
  log('');

  log('Test 1: Health check');
  const health = await getJson(`${API_BASE}/health`);
  assert(health.res.ok, 'Health check failed');
  assert(typeof health.body?.gccSource === 'string', 'gccSource missing from health response');
  assert('gccVersion' in (health.body ?? {}), 'gccVersion missing from health response');
  log(`✓ Health: ${JSON.stringify(health.body)}`);
  log('');

  log('Test 2: Compile valid C code');
  const compile = await getJson(`${API_BASE}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: '#include <stdio.h>\n\nint main() {\n    printf("Hello World!\\n");\n    return 0;\n}\n'
    })
  });
  log(JSON.stringify(compile.body, null, 2));
  assert(compile.body?.success === true, 'Compilation should succeed');
  assert(typeof compile.body?.binary === 'string' && compile.body.binary.length > 0, 'Binary path missing');
  log('✓ Compilation successful');
  log('');

  log('Test 3: Run compiled binary');
  const run = await getJson(`${API_BASE}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      binaryPath: compile.body.binary
    })
  });
  log(JSON.stringify(run.body, null, 2));
  assert(run.body?.exitCode === 0, 'Execution should succeed');
  log('✓ Execution successful');
  log('');

  log('Test 4: Compile invalid C code (should fail)');
  const invalid = await getJson(`${API_BASE}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: '#include <stdio.h>\n\nint main() {\n    printf("Missing semicolon")\n    return 0;\n}\n'
    })
  });
  log(JSON.stringify(invalid.body, null, 2));
  assert(invalid.body?.success === false, 'Invalid compilation should fail');
  log('✓ Compilation correctly failed');
  log('');

  log('Test 5: Trace execution');
  const trace = await getJson(`${API_BASE}/api/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: '#include <stdio.h>\n\nint main() {\n    int x = 10;\n    return 0;\n}\n',
      breakpoints: [4]
    })
  });
  log(JSON.stringify(trace.body, null, 2));
  assert(trace.body?.success === true, 'Trace should succeed');
  const firstStep = trace.body?.steps?.[0] ?? {};
  const runtime = firstStep.runtime ?? {};
  assert(
    runtime && typeof runtime.globals === 'object' && Array.isArray(runtime.frames) && typeof runtime.flatMemory === 'object',
    'Structured trace runtime snapshot missing'
  );
  log('✓ Trace endpoint working');
  log('✓ Structured trace runtime snapshot present');
  log('');

  log('Test 6: AI intent analysis');
  const analyze = await getJson(`${API_BASE}/api/analyze/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: '#include <stdio.h>\n\nint binary_search(int *arr, int n, int target) {\n    int low = 0;\n    int high = n - 1;\n    while (low <= high) {\n        int mid = low + (high - low) / 2;\n        if (arr[mid] == target) return mid;\n        if (arr[mid] < target) low = mid + 1;\n        else high = mid - 1;\n    }\n    return -1;\n}\n'
    })
  });
  log(JSON.stringify(analyze.body, null, 2));
  assert(analyze.body?.success === true, 'AI intent analysis should succeed');
  assert(typeof analyze.body?.summary === 'string', 'AI intent summary missing');
  assert(Array.isArray(analyze.body?.explanation), 'AI intent explanation missing');
  assert(Array.isArray(analyze.body?.candidates), 'AI intent candidates missing');
  log('✓ AI intent analysis returned structured output');
  log('');

  log('Test 7: Reject unsafe binary path');
  const unsafe = await getJson(`${API_BASE}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      binaryPath: '/bin/ls',
      args: [],
      input: ''
    })
  });
  log(JSON.stringify(unsafe.body, null, 2));
  assert(unsafe.body?.exitCode === 126, 'Unsafe binary path should be rejected');
  log('✓ Unsafe binary path correctly rejected');
  log('');

  log('═══════════════════════════════════════════════');
  log('  All tests passed! ✓');
  log('═══════════════════════════════════════════════');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
