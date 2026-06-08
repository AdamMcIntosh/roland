/**
 * PAT encryption for Dashboard 2.0 — stores GitHub tokens in anchor .roland/config.json.
 * Key derivation: scrypt(anchor path + hostname + user) unless PAT_ENCRYPTION_KEY is set.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import os from 'os';

const ALGORITHM = 'aes-256-gcm';

function resolveKey(anchorProjectRoot) {
  const envHex = process.env.PAT_ENCRYPTION_KEY ?? '';
  if (envHex.length === 64) {
    return Buffer.from(envHex, 'hex');
  }
  const salt = `roland-dashboard:${anchorProjectRoot}:${os.hostname()}:${process.env.USER ?? process.env.USERNAME ?? 'user'}`;
  return scryptSync(salt, 'roland-github-pat-v1', 32);
}

export function encryptPat(text, anchorProjectRoot) {
  const key = resolveKey(anchorProjectRoot);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${enc}`;
}

export function decryptPat(blob, anchorProjectRoot) {
  try {
    const parts = blob.split(':');
    if (parts.length < 3) throw new Error('malformed');
    const [ivHex, tagHex, enc] = parts;
    const key = resolveKey(anchorProjectRoot);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(enc, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    const err = new Error(
      'GitHub PAT is invalid or corrupted. Please disconnect and reconnect your GitHub account.',
    );
    err.code = 'PAT_CORRUPTED';
    throw err;
  }
}
