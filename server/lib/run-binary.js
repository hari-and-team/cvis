import { spawn } from 'child_process';
import fs from 'fs-extra';

const EXECUTION_TIMEOUT_MS = 5000;

export async function runBinary(binaryPath, args = [], input = '') {
  const startTime = Date.now();

  const exists = await fs.pathExists(binaryPath);
  if (!exists) {
    return {
      stdout: '',
      stderr: `Binary not found: ${binaryPath}`,
      exitCode: 127,
      executionTime: 0
    };
  }

  let timedOut = false;
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args, { stdio: 'pipe' });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, EXECUTION_TIMEOUT_MS);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });

      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();
    });

    exitCode = result.code ?? (timedOut ? 124 : 1);

    if (timedOut && !stderr) {
      stderr = `Execution timed out after ${EXECUTION_TIMEOUT_MS}ms`;
    }
  } catch (err) {
    stderr = err instanceof Error ? err.message : 'Execution failed';
    exitCode = 1;
  } finally {
    await fs.remove(binaryPath).catch(() => {});
  }

  return {
    stdout,
    stderr,
    exitCode,
    executionTime: Date.now() - startTime
  };
}
