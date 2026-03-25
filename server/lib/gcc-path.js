import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const SERVER_LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(SERVER_LIB_DIR, '..');
const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');
const TOOLCHAIN_METADATA_PATH = path.join(PROJECT_ROOT, '.cvis-toolchain', 'install.json');

function expandCompilerNames(basePath) {
  const variants = [basePath];
  if (!basePath.toLowerCase().endsWith('.exe')) {
    variants.push(`${basePath}.exe`);
  }
  return variants;
}

function getProjectCompilerCandidates() {
  return [
    getInstalledToolchainPath(),
    path.join(SERVER_ROOT, 'toolchain', 'bin', 'gcc'),
    path.join(PROJECT_ROOT, '.cvis-toolchain', 'bin', 'gcc'),
    path.join(PROJECT_ROOT, 'tools', 'gcc', 'bin', 'gcc')
  ].filter(Boolean).flatMap(expandCompilerNames);
}

function getSystemCompilerCandidates() {
  return [
    '/usr/bin/gcc',
    '/usr/local/bin/gcc',
    '/bin/gcc',
    'C:\\msys64\\ucrt64\\bin\\gcc',
    'C:\\msys64\\mingw64\\bin\\gcc',
    'C:\\MinGW\\bin\\gcc',
    'gcc'
  ].flatMap(expandCompilerNames);
}

export function getPreferredGccInfo() {
  const envPath = process.env.CVIS_GCC_PATH?.trim();
  if (envPath) {
    return {
      path: envPath,
      source: 'env'
    };
  }

  const projectLocal = getProjectCompilerCandidates().find((candidate) => fs.existsSync(candidate));
  if (projectLocal) {
    return {
      path: projectLocal,
      source: 'project-local'
    };
  }

  const system = getSystemCompilerCandidates().find((candidate) =>
    candidate === 'gcc' ? true : fs.existsSync(candidate)
  );

  return {
    path: system ?? 'gcc',
    source: system && system !== 'gcc' ? 'system' : 'path'
  };
}

export function getInstalledToolchainMetadata() {
  if (!fs.existsSync(TOOLCHAIN_METADATA_PATH)) {
    return null;
  }

  try {
    return fs.readJsonSync(TOOLCHAIN_METADATA_PATH);
  } catch {
    return null;
  }
}

export function getInstalledToolchainPath() {
  const metadata = getInstalledToolchainMetadata();
  if (!metadata || typeof metadata.gccPath !== 'string') {
    return null;
  }

  return metadata.gccPath;
}

export function getGccPath() {
  return getPreferredGccInfo().path;
}

export function getGccSource() {
  return getPreferredGccInfo().source;
}

export function getEffectiveGccSource() {
  const source = getGccSource();
  if (process.env.DOCKER_ENV && source !== 'env' && source !== 'project-local') {
    return 'docker';
  }
  return source;
}

export async function getGccVersion() {
  try {
    const { stdout = '' } = await execFileAsync(getGccPath(), ['--version'], { timeout: 2000 });
    return stdout.split(/\r?\n/)[0]?.trim() || null;
  } catch {
    return null;
  }
}

export async function verifyGcc() {
  try {
    const gccPath = getGccPath();
    await execFileAsync(gccPath, ['--version'], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export function getProjectCompilerLocations() {
  return getProjectCompilerCandidates();
}

export async function getGccHealthDetails() {
  const installedPath = getInstalledToolchainPath();
  const metadata = installedPath && fs.existsSync(installedPath) ? getInstalledToolchainMetadata() : null;

  return {
    gcc: getGccPath(),
    gccSource: getEffectiveGccSource(),
    gccVersion: await getGccVersion(),
    toolchainVersion: metadata?.version ?? null,
    toolchainPlatform: metadata?.platform ?? null,
    toolchainArch: metadata?.arch ?? null
  };
}
