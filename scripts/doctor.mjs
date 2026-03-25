import { access } from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileC } from '../server/lib/compile-c.js';
import { getEffectiveGccSource, getGccHealthDetails, verifyGcc } from '../server/lib/gcc-path.js';
import { runBinary } from '../server/lib/run-binary.js';
import { ensureNodeVersion, humanToolchainHint, readInstalledToolchain } from './toolchain-support.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let hasFailures = false;

function log(message = '') {
  console.log(message);
}

async function runCheck(name, fn) {
  try {
    const detail = await fn();
    log(`✓ ${name}${detail ? `: ${detail}` : ''}`);
  } catch (error) {
    hasFailures = true;
    log(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function warn(message) {
  log(`⚠ ${message}`);
}

async function main() {
  log('═══════════════════════════════════════════════');
  log('  cvis Doctor');
  log('═══════════════════════════════════════════════');

  await runCheck('Node.js version', async () => {
    const result = ensureNodeVersion();
    if (!result.ok) {
      throw new Error(`Expected Node.js 18+, found ${result.version}`);
    }
    return result.version;
  });

  await runCheck('Frontend dependencies', async () => {
    await access(path.join(PROJECT_ROOT, 'node_modules'), fsConstants.R_OK);
    return 'installed';
  });

  await runCheck('Backend dependencies', async () => {
    await access(path.join(PROJECT_ROOT, 'server', 'node_modules'), fsConstants.R_OK);
    return 'installed';
  });

  const installedToolchain = await readInstalledToolchain();
  if (installedToolchain?.gccPath) {
    await runCheck('Repo-local toolchain metadata', async () => {
      await access(installedToolchain.gccPath, fsConstants.X_OK);
      return `${installedToolchain.version} at ${installedToolchain.gccPath}`;
    });
  } else {
    warn(`Repo-local toolchain is not installed. ${humanToolchainHint()}`);
  }

  await runCheck('Compiler availability', async () => {
    const available = await verifyGcc();
    if (!available) {
      throw new Error(`No working compiler found. ${humanToolchainHint()}`);
    }

    const details = await getGccHealthDetails();
    return `${details.gccSource} -> ${details.gcc}`;
  });

  await runCheck('Backend compile/run smoke test', async () => {
    const compile = await compileC('#include <stdio.h>\nint main(void) { puts("doctor-ok"); return 0; }\n');
    if (!compile.success || typeof compile.binary !== 'string') {
      throw new Error(compile.errors?.[0] || 'Compilation failed');
    }

    const run = await runBinary(compile.binary, [], '');
    if (run.exitCode !== 0 || !run.stdout.includes('doctor-ok')) {
      throw new Error(run.stderr || 'Execution failed');
    }

    return 'compile + run succeeded';
  });

  const gccSource = getEffectiveGccSource();
  if (gccSource !== 'project-local') {
    warn(`Current compiler source is ${gccSource}. The recommended teammate-safe path is the repo-local toolchain.`);
  }

  log('');
  if (hasFailures) {
    console.error('Doctor found blocking issues.');
    process.exit(1);
  }

  log('Doctor checks completed successfully.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
