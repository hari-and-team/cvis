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
  assert(typeof health.body?.httpsConfigured === 'boolean', 'httpsConfigured missing from health response');
  assert(typeof health.body?.httpsRequired === 'boolean', 'httpsRequired missing from health response');
  assert(health.res.headers.get('x-content-type-options') === 'nosniff', 'nosniff header missing');
  assert(health.res.headers.get('x-frame-options') === 'DENY', 'frame protection header missing');
  assert(
    (health.res.headers.get('cache-control') || '').includes('no-store'),
    'Cache-Control no-store header missing'
  );
  log(`✓ Health: ${JSON.stringify(health.body)}`);
  log('✓ Security headers present on health response');
  log('');

  log('Test 2: Reject malformed JSON body');
  const malformedJson = await fetch(`${API_BASE}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"code":'
  });
  const malformedBody = await malformedJson.json();
  log(JSON.stringify(malformedBody, null, 2));
  assert(malformedJson.status === 400, 'Malformed JSON should return HTTP 400');
  assert(malformedBody?.error === 'Invalid JSON body', 'Malformed JSON should return a clear parse error');
  log('✓ Malformed JSON is rejected cleanly');
  log('');

  log('Test 3: Reject non-object JSON body');
  const invalidBody = await getJson(`${API_BASE}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(['not-an-object'])
  });
  log(JSON.stringify(invalidBody.body, null, 2));
  assert(invalidBody.res.status === 400, 'Non-object JSON body should return HTTP 400');
  assert(invalidBody.body?.errors?.[0] === 'Request body must be a JSON object', 'Non-object JSON should be rejected');
  log('✓ Non-object JSON body is rejected cleanly');
  log('');

  log('Test 4: Compile valid C code');
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

  log('Test 5: Run compiled binary');
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

  log('Test 6: Compile invalid C code (should fail)');
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

  log('Test 7: Trace execution');
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

  log('Test 8: Trace stdin happy path');
  const traceWithInput = await getJson(`${API_BASE}/api/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'int main() {\n  int x = 0;\n  scanf("%d", &x);\n  return x;\n}\n',
      input: '42\n',
      breakpoints: [4]
    })
  });
  log(JSON.stringify(traceWithInput.body, null, 2));
  assert(traceWithInput.body?.success === true, 'Trace with stdin should succeed');
  const scanfStep = traceWithInput.body?.steps?.[0];
  const scanfValue = scanfStep?.runtime?.frames?.[0]?.locals?.x;
  assert(scanfValue === 42, 'Trace stdin should populate the traced variable');
  log('✓ Trace stdin is applied to runtime state');
  log('');

  log('Test 9: Reject invalid trace input type');
  const invalidTraceInput = await getJson(`${API_BASE}/api/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'int main() { return 0; }\n',
      input: 123
    })
  });
  log(JSON.stringify(invalidTraceInput.body, null, 2));
  assert(invalidTraceInput.res.status === 400, 'Invalid trace input type should return HTTP 400');
  assert(
    invalidTraceInput.body?.errors?.[0] === '"input" must be a string when provided',
    'Invalid trace input type should return a clear validation message'
  );
  log('✓ Invalid trace input is rejected cleanly');
  log('');

  log('Test 10: Trace supports switch/case control flow');
  const switchTrace = await getJson(`${API_BASE}/api/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code:
        '#include <stdio.h>\nint main() {\n  int x = 2;\n  int y = 0;\n  switch (x) {\n    case 1:\n      y = 11;\n      break;\n    case 2:\n      y = 22;\n      break;\n    default:\n      y = 33;\n  }\n  return y;\n}\n'
    })
  });
  log(JSON.stringify(switchTrace.body, null, 2));
  assert(switchTrace.body?.success === true, 'Switch/case trace should succeed');
  const switchLastStep = switchTrace.body?.steps?.at(-1);
  const switchY = switchLastStep?.runtime?.frames?.[0]?.locals?.y;
  assert(
    switchY === 22,
    'Switch/case trace should execute the matching branch and preserve break semantics'
  );
  log('✓ Switch/case trace now succeeds');
  log('');

  log('Test 11: Trace stops runaway loops cleanly');
  const runawayTrace = await getJson(`${API_BASE}/api/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'int main() {\n  while (1) {\n  }\n  return 0;\n}\n'
    })
  });
  log(JSON.stringify({
    success: runawayTrace.body?.success,
    totalSteps: runawayTrace.body?.totalSteps,
    errors: runawayTrace.body?.errors,
    phase: runawayTrace.body?.phase
  }, null, 2));
  assert(runawayTrace.body?.success === false, 'Runaway trace should fail cleanly');
  assert(
    Array.isArray(runawayTrace.body?.errors) && runawayTrace.body.errors[0]?.includes('maximum step limit'),
    'Runaway trace should explain the step limit'
  );
  log('✓ Runaway loops return a controlled step-limit error');
  log('');

  log('Test 12: AI intent analysis');
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

  log('Test 13: Trace supports typedef-based binary tree nodes');
  const typedefTreeTrace = await getJson(`${API_BASE}/api/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code:
        'typedef struct Node {\n' +
        '  int data;\n' +
        '  struct Node* left;\n' +
        '  struct Node* right;\n' +
        '} Node;\n\n' +
        'Node* createNode(int data) {\n' +
        '  Node* node = (Node*)malloc(sizeof(Node));\n' +
        '  node->data = data;\n' +
        '  node->left = NULL;\n' +
        '  node->right = NULL;\n' +
        '  return node;\n' +
        '}\n\n' +
        'int main() {\n' +
        '  Node* root = createNode(1);\n' +
        '  root->left = createNode(2);\n' +
        '  root->right = createNode(3);\n' +
        '  return 0;\n' +
        '}\n'
    })
  });
  log(JSON.stringify({
    success: typedefTreeTrace.body?.success,
    totalSteps: typedefTreeTrace.body?.totalSteps,
    errors: typedefTreeTrace.body?.errors
  }, null, 2));
  assert(typedefTreeTrace.body?.success === true, 'Typedef-based binary tree trace should succeed');
  const heap = typedefTreeTrace.body?.steps?.at(-1)?.runtime?.heap ?? {};
  assert(Object.keys(heap).length >= 3, 'Binary tree trace should capture heap-backed nodes');
  log('✓ Typedef-based binary tree trace now succeeds');
  log('');

  log('Test 14: Reject unsafe binary path');
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
