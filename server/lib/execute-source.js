import fs from 'fs-extra';
import { compileC } from './compile-c.js';
import { runBinary } from './run-binary.js';

export async function executeSource(code, args = [], input = '') {
  const compileResult = await compileC(code);

  if (!compileResult.success || !compileResult.binary) {
    return {
      success: false,
      compile: compileResult,
      execution: null
    };
  }

  try {
    const execution = await runBinary(compileResult.binary, args, input);
    return {
      success: execution.exitCode === 0,
      compile: compileResult,
      execution
    };
  } finally {
    await fs.remove(compileResult.binary).catch(() => {});
  }
}
