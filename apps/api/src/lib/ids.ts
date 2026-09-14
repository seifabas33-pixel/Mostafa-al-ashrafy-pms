import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function shortCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function confirmationNumber(propertyCode: string): string {
  return `${propertyCode}-${shortCode(6)}`;
}

export function apiKeyString(): string {
  return `pms_${randomBytes(24).toString('base64url')}`;
}

/**
 * API keys are stored as a SHA-256 digest, never in plaintext: a database copy, backup or
 * replica then yields no usable credentials. The key itself is high-entropy and random, so a
 * plain digest is enough — there is no low-entropy password to slow down with a KDF.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Non-secret leading fragment, kept alongside the hash so a key is recognisable in listings. */
export function apiKeyPrefix(key: string): string {
  return key.slice(0, 12);
}
