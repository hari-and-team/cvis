import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';

const execAsync = promisify(exec);

export function getGccPath() {
  if (process.env.DOCKER_ENV) {
    return '/usr/local/bin/gcc';
  }

  return fs.existsSync('/usr/bin/gcc') ? '/usr/bin/gcc' : 'gcc';
}

export async function verifyGcc() {
  try {
    const gccPath = getGccPath();
    await execAsync(`${gccPath} --version`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
