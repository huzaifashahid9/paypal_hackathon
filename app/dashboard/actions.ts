'use server';

import { approveHeldOrder, approveRefund, declineHeldOrder, declineRefund } from '@/lib/orders';

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    console.error('dashboard action failed', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
  }
}

export const approveOrderAction = async (orderId: string): Promise<ActionResult> => run(() => approveHeldOrder(orderId));
export const declineOrderAction = async (orderId: string): Promise<ActionResult> => run(() => declineHeldOrder(orderId));
export const approveRefundAction = async (refundId: string): Promise<ActionResult> => run(() => approveRefund(refundId));
export const declineRefundAction = async (refundId: string): Promise<ActionResult> => run(() => declineRefund(refundId));
