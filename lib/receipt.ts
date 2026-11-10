import { createHmac, timingSafeEqual } from 'node:crypto';

type ReceiptFields = { orderId: string; totalCents: number; paypalOrderId: string; paypalCaptureId: string };

const canonical = (f: ReceiptFields): string => [f.orderId, f.totalCents, f.paypalOrderId, f.paypalCaptureId].join('|');

const secret = (): string => process.env.RECEIPT_SECRET || 'openshelf-dev-secret';

/** HMAC over the facts of a paid order, so a receipt cannot be altered without detection. */
export function signReceipt(fields: ReceiptFields): string {
  return createHmac('sha256', secret()).update(canonical(fields)).digest('hex');
}

export function verifyReceipt(fields: ReceiptFields, signature: string): boolean {
  const expected = Buffer.from(signReceipt(fields), 'hex');
  const given = Buffer.from(signature, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
