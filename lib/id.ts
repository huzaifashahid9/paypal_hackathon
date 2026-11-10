import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();

// No 0/O/1/I so a pass code survives being read aloud or retyped.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A Buyer Pass code such as PASS-7K2Q-9MXD. Shown once; only its hash is stored. */
export function newPassCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `PASS-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function normalizePassCode(code: string): string {
  return code.trim().toUpperCase();
}

export function hashPassCode(code: string): string {
  return createHash('sha256').update(normalizePassCode(code)).digest('hex');
}
