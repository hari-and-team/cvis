import { access } from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { loadToolchainManifest, supportedBootstrapTarget, defaultArchivePath, downloadFile, verifyChecksum, extractArchive, findCompilerBinary, writeInstalledToolchain, linkToolchainBin, manifestInstallId, defaultExtractDir, humanToolchainHint, readInstalledToolchain, formatPlatformLabel } from './toolchain-support.mjs';

function log(message = '') {
  console.log(message);
}

async function ensureExecutable(binaryPath) {
  await access(binaryPath, fsConstants.X_OK);
}

async function main() {
  const manifest = await loadToolchainManifest();
  const resolved = supportedBootstrapTarget(manifest);

  log('═══════════════════════════════════════════════');
  log('  cvis Toolchain Bootstrap');
  log('═══════════════════════════════════════════════');
  log(`Target: ${formatPlatformLabel()}`);

  if (!resolved.supported) {
    console.error(`✗ ${resolved.reason}`);
    console.error('Use local GCC or Docker on this platform for now.');
    process.exit(1);
  }

  const { target } = resolved;
  const installId = manifestInstallId(manifest);
  const archivePath = defaultArchivePath(target.assetName);
  const extractDir = defaultExtractDir(installId);
  const existing = await readInstalledToolchain();

  if (
    existing?.installId === installId &&
    typeof existing.gccPath === 'string'
  ) {
    try {
      await ensureExecutable(existing.gccPath);
      log(`✓ Repo-local toolchain already installed at ${existing.gccPath}`);
      return;
    } catch {
      log('ℹ️ Existing toolchain metadata was found, but the compiler is missing. Reinstalling...');
    }
  }

  log(`Downloading ${target.assetName}...`);
  await downloadFile(target.url, archivePath);
  log(`Verifying checksum (${target.sha256.slice(0, 12)}...)...`);
  await verifyChecksum(archivePath, target.sha256);

  log('Extracting toolchain archive...');
  await extractArchive(archivePath, extractDir);

  const gccPath = await findCompilerBinary(extractDir);
  if (!gccPath) {
    throw new Error(`Unable to locate gcc inside ${path.basename(target.assetName)} after extraction.`);
  }

  await ensureExecutable(gccPath);
  const linked = await linkToolchainBin(path.dirname(gccPath));

  await writeInstalledToolchain({
    installId,
    vendor: manifest.vendor,
    toolchain: manifest.toolchain,
    version: manifest.version,
    platform: process.platform,
    arch: process.arch,
    assetName: target.assetName,
    assetUrl: target.url,
    sha256: target.sha256,
    extractedDir: extractDir,
    gccPath,
    linkedBin: linked,
    installedAt: new Date().toISOString()
  });

  log(`✓ Repo-local GCC installed`);
  log(`  GCC: ${gccPath}`);
  if (!linked) {
    log('ℹ️ Bin directory linking was skipped; the backend will use install metadata to resolve gcc.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(humanToolchainHint());
  process.exit(1);
});
