import os from 'os';
import path from 'path';

const TMP_DIR = path.resolve(os.tmpdir());
const SAFE_BINARY_NAME = /^code_[A-Za-z0-9_-]+\.(?:out|exe)$/i;

export function getManagedBinaryExtension(platform = process.platform) {
  return platform === 'win32' ? '.exe' : '.out';
}

export function getManagedBinaryPath(tmpDir, jobId, platform = process.platform) {
  return path.join(tmpDir, `code_${jobId}${getManagedBinaryExtension(platform)}`);
}

export function isSafeManagedBinaryPath(binaryPath) {
  if (typeof binaryPath !== 'string' || !binaryPath.trim()) {
    return false;
  }

  const resolved = path.resolve(binaryPath);
  const inTmpDir = resolved.startsWith(`${TMP_DIR}${path.sep}`);
  const safeName = SAFE_BINARY_NAME.test(path.basename(resolved));

  return inTmpDir && safeName;
}
