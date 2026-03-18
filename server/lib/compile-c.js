import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { getGccPath } from './gcc-path.js';

const execFileAsync = promisify(execFile);

function splitCompilerOutput(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function compileC(code) {
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const srcFile = path.join(tmpDir, `code_${timestamp}.c`);
  const binFile = path.join(tmpDir, `code_${timestamp}.out`);

  try {
    await fs.writeFile(srcFile, code);

    const startTime = Date.now();
    const gccPath = getGccPath();

    try {
      const { stderr = '' } = await execFileAsync(gccPath, ['-o', binFile, srcFile, '-Wall'], { timeout: 10000 });
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
        output: `Compiled successfully to ${binFile}`,
        errors: [],
        warnings: splitCompilerOutput(stderr),
        compilationTime
      };
    } catch (err) {
      const compilationTime = Date.now() - startTime;
      const compilerOutput = typeof err?.stderr === 'string' ? err.stderr : err?.message || 'Compilation failed';

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
