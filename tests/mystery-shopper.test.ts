import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/paypal', () => ({
  paypalConfigured: () => true,
  createOrder: vi.fn(async (i: { orderId: string }) => ({ id: `PP-${i.orderId.slice(0, 8)}`, approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=PP-${i.orderId.slice(0, 8)}` })),
}));

process.env.PGLITE_DIR = 'memory';
delete process.env.DATABASE_URL;
delete process.env.OPENAI_API_KEY;

import { nextSaturday, runMysteryShopper } from '@/lib/mystery-shopper';

describe('Mystery Shopper', () => {
  it('always picks a Saturday in the future', () => {
    expect(nextSaturday(new Date('2026-11-10T12:00:00Z'))).toBe('2026-11-14');
    expect(nextSaturday(new Date('2026-11-14T23:59:00Z'))).toBe('2026-11-21');
    expect(nextSaturday(new Date('2026-11-15T00:00:00Z'))).toBe('2026-11-21');
  });

  it('gets one order allowed, one held and one blocked, on every run', async () => {
    for (let i = 0; i < 2; i++) {
      const run = await runMysteryShopper();
      expect(run.scenarios.map((s) => s.outcome)).toEqual(['allowed', 'held', 'blocked']);
      expect(run.scenarios[0].approveUrl).toContain('sandbox.paypal.com');
      expect(run.scenarios[1].orderId).toBeTruthy();
      // Pass codes never reach the browser in full.
      expect(JSON.stringify(run)).not.toMatch(/PASS-[A-Z0-9]{4}-[A-Z0-9]{4}/);
    }
  });
});
