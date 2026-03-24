const API_BASE = process.env.CVIS_API_BASE ?? 'http://localhost:3001';

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.error || body?.stderr || response.statusText;
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${message}`);
  }

  return body;
}

async function compileProgram(code) {
  const result = await requestJson('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });

  if (!result.success || !result.binary) {
    throw new Error(`Compile failed: ${result.errors?.join('\n') || 'unknown error'}`);
  }

  return result.binary;
}

async function startSession(binaryPath) {
  const result = await requestJson('/api/run/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ binaryPath, args: [] })
  });

  if (!result.success || !result.sessionId) {
    throw new Error(result.error || 'Run session failed to start');
  }

  return result.sessionId;
}

async function pollSession(sessionId) {
  return requestJson(`/api/run/poll?sessionId=${encodeURIComponent(sessionId)}`);
}

async function sendInput(sessionId, input) {
  return requestJson('/api/run/input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, input })
  });
}

async function sendEof(sessionId) {
  return requestJson('/api/run/eof', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
}

async function waitFor(predicate, label, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;

  while (Date.now() < deadline) {
    lastValue = await predicate();
    if (lastValue) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  throw new Error(`Timed out waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testPromptAndInputEcho() {
  const code = `
#include <stdio.h>

int main(void) {
  int value = 0;
  printf("Enter value: ");
  fflush(stdout);
  if (scanf("%d", &value) != 1) {
    printf("bad input\\n");
    return 1;
  }
  printf("got %d\\n", value);
  return 0;
}
`;

  const binaryPath = await compileProgram(code);
  const sessionId = await startSession(binaryPath);
  const initialPoll = await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.output.includes('Enter value: ') ? poll : null;
  }, 'prompt text');

  assert(!initialPoll.done, 'Session should still be waiting for input');
  await sendInput(sessionId, '7\n');

  const completed = await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.done ? poll : null;
  }, 'completed prompt/input run');

  assert(completed.output.includes('Enter value: 7'), 'Prompt/input transcript order is wrong');
  assert(completed.output.includes('got 7'), 'Expected success output after input');
  console.log('PASS prompt-and-input-echo');
}

async function testBlankLineBeforeValidInput() {
  const code = `
#include <stdio.h>

int main(void) {
  char buffer[32];
  printf("Line? ");
  fflush(stdout);
  if (!fgets(buffer, sizeof(buffer), stdin)) {
    printf("EOF\\n");
    return 2;
  }
  if (buffer[0] == '\\n') {
    printf("blank line\\n");
  } else {
    printf("line: %s", buffer);
  }
  return 0;
}
`;

  const binaryPath = await compileProgram(code);
  const sessionId = await startSession(binaryPath);

  await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.output.includes('Line? ') ? poll : null;
  }, 'initial line prompt');

  await sendInput(sessionId, '\n');

  const completed = await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.done ? poll : null;
  }, 'completed blank-line run');

  assert(completed.output.includes('Line? \n'), 'Blank line should still be echoed into the transcript');
  assert(completed.output.includes('blank line'), 'Program should receive the blank line submission');
  console.log('PASS blank-line-submission');
}

async function testMenuLoopAndQueuedInput() {
  const code = `
#include <stdio.h>

int main(void) {
  int value = -1;
  while (value != 0) {
    printf("Menu 1/0: ");
    fflush(stdout);
    if (scanf("%d", &value) != 1) {
      printf("bad\\n");
      int ch = 0;
      while ((ch = getchar()) != '\\n' && ch != EOF) {}
      continue;
    }
    printf("got=%d\\n", value);
  }
  return 0;
}
`;

  const binaryPath = await compileProgram(code);
  const sessionId = await startSession(binaryPath);

  await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.output.includes('Menu 1/0: ') ? poll : null;
  }, 'initial menu prompt');

  await sendInput(sessionId, 'x\n');

  await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.output.includes('bad\nMenu 1/0: ') ? poll : null;
  }, 'menu retry prompt');

  await sendInput(sessionId, '1\n0\n');

  const completed = await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.done ? poll : null;
  }, 'completed menu loop run');

  assert(completed.output.includes('bad'), 'Invalid token should trigger retry feedback');
  assert(completed.output.includes('got=1'), 'Queued valid input should advance the menu loop');
  assert(completed.output.includes('got=0'), 'Queued exit input should finish the menu loop');
  console.log('PASS menu-loop-and-queued-input');
}

async function testLongMultilinePasteSession() {
  const code = `
#include <stdio.h>

int main(void) {
  char buffer[32];
  for (int i = 0; i < 6; i += 1) {
    printf("L%d: ", i + 1);
    fflush(stdout);
    if (!fgets(buffer, sizeof(buffer), stdin)) {
      printf("EOF\\n");
      return 2;
    }
    printf("[%s]", buffer);
  }
  return 0;
}
`;

  const binaryPath = await compileProgram(code);
  const sessionId = await startSession(binaryPath);

  await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.output.includes('L1: ') ? poll : null;
  }, 'initial multiline prompt');

  await sendInput(sessionId, 'alpha\nbeta\ngamma\ndelta\nepsilon\nzeta\n');

  const completed = await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.done ? poll : null;
  }, 'completed multiline paste run');

  assert(completed.output.includes('[alpha\n]'), 'First pasted line should be preserved');
  assert(completed.output.includes('[zeta\n]'), 'Last pasted line should be preserved');
  console.log('PASS long-multiline-paste-session');
}

async function testEofSignal() {
  const code = `
#include <stdio.h>

int main(void) {
  int value = 0;
  printf("Awaiting input: ");
  fflush(stdout);
  if (scanf("%d", &value) != 1) {
    printf("EOF handled\\n");
    return 3;
  }
  printf("unexpected %d\\n", value);
  return 0;
}
`;

  const binaryPath = await compileProgram(code);
  const sessionId = await startSession(binaryPath);

  await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.output.includes('Awaiting input: ') ? poll : null;
  }, 'stdin prompt before eof');

  await sendEof(sessionId);

  const completed = await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.done ? poll : null;
  }, 'completed eof run');

  assert(completed.output.includes('EOF handled'), 'Program should report EOF handling');
  assert(completed.exitCode === 3, `Expected exit code 3, received ${completed.exitCode}`);
  console.log('PASS eof-signal');
}

async function testPartialInputThenEof() {
  const code = `
#include <stdio.h>

int main(void) {
  int left = 0;
  int right = 0;
  printf("Need two ints: ");
  fflush(stdout);
  int rc = scanf("%d %d", &left, &right);
  printf("rc=%d left=%d right=%d eof=%d\\n", rc, left, right, feof(stdin));
  return 0;
}
`;

  const binaryPath = await compileProgram(code);
  const sessionId = await startSession(binaryPath);

  await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.output.includes('Need two ints: ') ? poll : null;
  }, 'partial eof prompt');

  await sendInput(sessionId, '5');
  await sendEof(sessionId);

  const completed = await waitFor(async () => {
    const poll = await pollSession(sessionId);
    return poll.done ? poll : null;
  }, 'completed partial eof run');

  assert(completed.output.includes('Need two ints: 5^D'), 'Transcript should show partial input followed by EOF');
  assert(completed.output.includes('rc=1 left=5 right=0 eof=1'), 'Program should complete after partial input EOF');
  console.log('PASS partial-input-then-eof');
}

async function main() {
  await requestJson('/health');
  await testPromptAndInputEcho();
  await testBlankLineBeforeValidInput();
  await testMenuLoopAndQueuedInput();
  await testLongMultilinePasteSession();
  await testEofSignal();
  await testPartialInputThenEof();
  console.log('All run-session checks passed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
