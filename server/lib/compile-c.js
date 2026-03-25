import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { COMPILATION_LIMITS, REQUEST_LIMITS } from '../config/constants.js';
import { getManagedBinaryPath } from './binary-artifacts.js';
import { getGccPath } from './gcc-path.js';

const execFileAsync = promisify(execFile);

function splitCompilerOutput(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function compileC(code) {
  if (typeof code !== 'string') {
    return {
      success: false,
      errors: ['Code must be a string'],
      warnings: [],
      compilationTime: 0
    };
  }

  if (Buffer.byteLength(code, 'utf8') > REQUEST_LIMITS.codeBytes) {
    return {
      success: false,
      errors: [`Code exceeds maximum allowed size of ${REQUEST_LIMITS.codeBytes} bytes`],
      warnings: [],
      compilationTime: 0
    };
  }

  const tmpDir = os.tmpdir();
  const jobId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const srcFile = path.join(tmpDir, `code_${jobId}.c`);
  const binFile = getManagedBinaryPath(tmpDir, jobId);

  try {
    await fs.writeFile(srcFile, code, 'utf8');

    const startTime = Date.now();
    const gccPath = getGccPath();

    try {
      const { stderr = '' } = await execFileAsync(
        gccPath,
        ['-o', binFile, srcFile, '-Wall'],
        { timeout: COMPILATION_LIMITS.timeoutMs }
      );
      const compilationTime = Date.now() - startTime;
      const binaryExists = await fs.pathExists(binFile);

      if (!binaryExists) {
        return {
          success: false,
          errors: ['Compilation failed: binary not created'],
          warnings: [],
          compilationTime
        };
      }

      return {
        success: true,
        binary: binFile,
        output: splitCompilerOutput(stderr).length > 0 ? 'Compiled with warnings' : 'Compiled successfully',
        errors: [],
        warnings: splitCompilerOutput(stderr),
        compilationTime
      };
    } catch (err) {
      const compilationTime = Date.now() - startTime;
      const timedOut = Boolean(err?.killed || err?.signal === 'SIGTERM');
      const compilerOutput = timedOut
        ? `Compilation timed out after ${COMPILATION_LIMITS.timeoutMs}ms`
        : typeof err?.stderr === 'string'
          ? err.stderr
          : err?.message || 'Compilation failed';

      await fs.remove(binFile).catch(() => {});

      return {
        success: false,
        errors: splitCompilerOutput(compilerOutput),
        warnings: [],
        compilationTime
      };
    }
  } finally {
    await fs.remove(srcFile).catch(() => {});
  }
}
