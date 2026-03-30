import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
export const DEV_CERT_DIR = path.join(PROJECT_ROOT, '.cvis-devcert');
export const DEV_CERT_KEY_PATH = path.join(DEV_CERT_DIR, 'localhost-key.pem');
export const DEV_CERT_CERT_PATH = path.join(DEV_CERT_DIR, 'localhost-cert.pem');
const DEV_CERT_META_PATH = path.join(DEV_CERT_DIR, 'metadata.json');

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if ((code ?? 0) !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code ?? 1}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function commandExists(command) {
  try {
    await runCommand(process.platform === 'win32' ? 'where' : 'which', [command]);
    return true;
  } catch {
    return false;
  }
}

async function readExistingMetadata() {
  try {
    const raw = await fs.readFile(DEV_CERT_META_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return null;
  }
}

async function writeMetadata(metadata) {
  await fs.writeFile(DEV_CERT_META_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
}

async function generateMkcertCertificate() {
  await runCommand('mkcert', ['-install']);
  await runCommand('mkcert', [
    '-cert-file',
    DEV_CERT_CERT_PATH,
    '-key-file',
    DEV_CERT_KEY_PATH,
    'localhost',
    '127.0.0.1',
    '::1'
  ]);

  await writeMetadata({
    source: 'mkcert',
    trusted: true
  });

  return {
    keyPath: DEV_CERT_KEY_PATH,
    certPath: DEV_CERT_CERT_PATH,
    created: true,
    source: 'mkcert',
    trusted: true
  };
}

export async function ensureDevTlsCert() {
  await fs.mkdir(DEV_CERT_DIR, { recursive: true });
  const preferredSource = (await commandExists('mkcert')) ? 'mkcert' : 'selfsigned';
  const existingMetadata = await readExistingMetadata();

  try {
    await fs.access(DEV_CERT_KEY_PATH);
    await fs.access(DEV_CERT_CERT_PATH);

    if (
      existingMetadata &&
      (existingMetadata.source === preferredSource ||
        (preferredSource === 'selfsigned' && existingMetadata.source === 'mkcert'))
    ) {
      return {
        keyPath: DEV_CERT_KEY_PATH,
        certPath: DEV_CERT_CERT_PATH,
        created: false,
        source: existingMetadata.source,
        trusted: existingMetadata.trusted === true
      };
    }
  } catch {
    // Generate below.
  }

  if (preferredSource === 'mkcert') {
    return generateMkcertCertificate();
  }

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await selfsigned.generate(attrs, {
    algorithm: 'sha256',
    keySize: 2048,
    days: 30,
    extensions: [
      { name: 'basicConstraints', cA: false },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true
      },
      {
        name: 'extKeyUsage',
        serverAuth: true
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: '*.localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '0.0.0.0' },
          { type: 7, ip: '::1' }
        ]
      }
    ]
  });

  await fs.writeFile(DEV_CERT_KEY_PATH, pems.private, { mode: 0o600 });
  await fs.writeFile(DEV_CERT_CERT_PATH, pems.cert, { mode: 0o644 });
  await writeMetadata({
    source: 'selfsigned',
    trusted: false
  });

  return {
    keyPath: DEV_CERT_KEY_PATH,
    certPath: DEV_CERT_CERT_PATH,
    created: true,
    source: 'selfsigned',
    trusted: false
  };
}
