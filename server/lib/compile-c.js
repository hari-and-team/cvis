import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { COMPILATION_LIMITS, REQUEST_LIMITS } from '../config/constants.js';
import { getManagedBinaryPath } from './binary-artifacts.js';
import { getGccPath, verifyGcc } from './gcc-path.js';

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
  const ioShimFile = path.join(tmpDir, `code_${jobId}_stdio_shim.c`);
  const binFile = getManagedBinaryPath(tmpDir, jobId);
  const gccPath = getGccPath();

  if (!(await verifyGcc())) {
    return {
      success: false,
      errors: [
        `GCC is not available in this deployment (resolved path: ${gccPath}). Deploy the execution backend on a host that supports native compiler binaries.`
      ],
      warnings: [],
      compilationTime: 0
    };
  }

  const ioShimSource = [
    '#include <stdio.h>',
    '',
    '// Force prompt-friendly stdio so interactive programs behave like a real',
    '// terminal session even when the app captures output through pipes.',
    'static void cvis_unbuffer_stdio(void) __attribute__((constructor));',
    'static void cvis_unbuffer_stdio(void) {',
    '  setvbuf(stdout, NULL, _IONBF, 0);',
    '  setvbuf(stderr, NULL, _IONBF, 0);',
    '}',
    ''
  ].join('\n');

  try {
    await fs.writeFile(srcFile, code, 'utf8');
    await fs.writeFile(ioShimFile, ioShimSource, 'utf8');

    const startTime = Date.now();

    try {
      const { stderr = '' } = await execFileAsync(
        gccPath,
        ['-o', binFile, srcFile, ioShimFile, '-Wall'],
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
    await fs.remove(ioShimFile).catch(() => {});
  }
}
