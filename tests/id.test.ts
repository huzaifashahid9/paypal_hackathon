import { describe, expect, it } from 'vitest';
import { hashPassCode, newPassCode } from '@/lib/id';

describe('pass codes', () => {
  it('look like PASS-XXXX-XXXX without ambiguous characters', () => {
    for (let i = 0; i < 50; i++) expect(newPassCode()).toMatch(/^PASS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });
  it('hash the same whatever the case or spacing', () => {
    expect(hashPassCode(' pass-abcd-2345 ')).toBe(hashPassCode('PASS-ABCD-2345'));
  });
});
