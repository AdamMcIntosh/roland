import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function key(): Buffer {
  const hex = process.env.PAT_ENCRYPTION_KEY ?? '';
  if (hex.length !== 64) {
    throw new Error('PAT_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const enc = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${enc}`;
}

export function decrypt(blob: string): string {
  try {
    const parts = blob.split(':');
    if (parts.length < 3) throw new Error('malformed');
    const [ivHex, tagHex, enc] = parts;
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(enc, 'hex', 'utf8') + decipher.final('utf8');
  } catch (e) {
    const err = new Error(
      'GitHub PAT is invalid or corrupted. Please disconnect and reconnect your GitHub account.',
    ) as Error & { code: string };
    err.code = 'PAT_CORRUPTED';
    throw err;
  }
}
