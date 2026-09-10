import { randomBytes } from 'node:crypto';

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
