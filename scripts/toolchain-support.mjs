import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import extractZip from 'extract-zip';
import * as tar from 'tar';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
export const TOOLCHAIN_DIR = path.join(PROJECT_ROOT, '.cvis-toolchain');
export const TOOLCHAIN_DOWNLOAD_DIR = path.join(TOOLCHAIN_DIR, 'downloads');
export const TOOLCHAIN_INSTALLS_DIR = path.join(TOOLCHAIN_DIR, 'toolchains');
export const TOOLCHAIN_METADATA_PATH = path.join(TOOLCHAIN_DIR, 'install.json');
export const TOOLCHAIN_MANIFEST_PATH = path.join(SCRIPT_DIR, 'toolchain-manifest.json');

export async function loadToolchainManifest() {
  const raw = await fs.readFile(TOOLCHAIN_MANIFEST_PATH, 'utf8');
  return JSON.parse(raw);
}

export function currentTargetKey(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

export function getToolchainTarget(manifest, platform = process.platform, arch = process.arch) {
  return manifest.targets[currentTargetKey(platform, arch)] ?? null;
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function safeRemove(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

export async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'cvis-toolchain-bootstrap'
    }
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download toolchain asset: ${response.status} ${response.statusText}`);
  }

  await ensureDir(path.dirname(destinationPath));
  const tempPath = `${destinationPath}.part`;
  await safeRemove(tempPath);

  await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath));
  await fs.rename(tempPath, destinationPath);
}

export async function verifyChecksum(filePath, expectedSha256) {
  const actual = await sha256File(filePath);
  if (actual !== expectedSha256) {
    throw new Error(`Checksum mismatch for ${path.basename(filePath)}. Expected ${expectedSha256}, received ${actual}.`);
  }
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

export async function extractArchive(archivePath, destinationDir) {
  await safeRemove(destinationDir);
  await ensureDir(destinationDir);

  if (archivePath.endsWith('.zip')) {
    await extractZip(archivePath, { dir: destinationDir });
    return;
  }

  if (archivePath.endsWith('.tar.gz')) {
    await tar.x({
      file: archivePath,
      cwd: destinationDir,
      gzip: true
    });
    return;
  }

  throw new Error(`Unsupported archive format: ${archivePath}`);
}

export async function findCompilerBinary(rootDir, platform = process.platform) {
  const preferredName = platform === 'win32' ? 'gcc.exe' : 'gcc';
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase() === preferredName) {
        return fullPath;
      }
    }
  }

  return null;
}

export async function writeInstalledToolchain(metadata) {
  await ensureDir(TOOLCHAIN_DIR);
  await fs.writeFile(TOOLCHAIN_METADATA_PATH, JSON.stringify(metadata, null, 2), 'utf8');
}

export async function readInstalledToolchain() {
  if (!existsSync(TOOLCHAIN_METADATA_PATH)) {
    return null;
  }

  try {
    const raw = await fs.readFile(TOOLCHAIN_METADATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function linkToolchainBin(binDir) {
  const linkPath = path.join(TOOLCHAIN_DIR, 'bin');
  await safeRemove(linkPath);

  try {
    await fs.symlink(path.resolve(binDir), linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch {
    return false;
  }
}

export function formatPlatformLabel(platform = process.platform, arch = process.arch) {
  return `${platform}/${arch}`;
}

export function manifestInstallId(manifest, platform = process.platform, arch = process.arch) {
  return `${manifest.toolchain}-${manifest.version}-${platform}-${arch}`;
}

export function humanToolchainHint() {
  return 'Run `npm run setup:toolchain` to install the repo-local GCC bundle.';
}

export function supportedBootstrapTarget(manifest, platform = process.platform, arch = process.arch) {
  const target = getToolchainTarget(manifest, platform, arch);
  if (!target) {
    return {
      supported: false,
      reason: `No bootstrap toolchain is configured for ${formatPlatformLabel(platform, arch)}.`
    };
  }

  if (target.unsupported) {
    return {
      supported: false,
      reason: target.reason
    };
  }

  return {
    supported: true,
    target
  };
}

export function ensureNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  return {
    ok: major >= 18,
    version: process.version
  };
}

export function defaultArchivePath(assetName) {
  return path.join(TOOLCHAIN_DOWNLOAD_DIR, assetName);
}

export function defaultExtractDir(installId) {
  return path.join(TOOLCHAIN_INSTALLS_DIR, installId);
}
