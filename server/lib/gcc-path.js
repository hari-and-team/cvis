import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';

const execAsync = promisify(exec);

export function getGccPath() {
  const knownPaths = ['/usr/bin/gcc', '/usr/local/bin/gcc', '/bin/gcc'];
  return knownPaths.find((candidate) => fs.existsSync(candidate)) ?? 'gcc';
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
