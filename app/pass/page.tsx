import { connection } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { PassForm } from './pass-form';

export const metadata = { title: 'Buyer Pass · OpenShelf' };

export default async function PassPage() {
  await connection();
  const db = await getDb();
  const shops = await db.select({ id: schema.shops.id, name: schema.shops.name }).from(schema.shops);
  return (
    <main className="page">
      <div className="eyebrow">Buyer Pass</div>
      <h1 style={{ fontSize: 40, margin: '8px 0 12px' }}>Give your AI agent a budget, not your wallet.</h1>
      <p className="muted" style={{ maxWidth: 560, marginBottom: 32 }}>
        A Buyer Pass is a spending limit for your assistant. It sets how much it may spend, where, and until when. You
        approve each payment in PayPal.
      </p>
      <PassForm shops={shops} />
    </main>
  );
}
