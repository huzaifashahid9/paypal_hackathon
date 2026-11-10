'use client';

import { useActionState } from 'react';
import { createPassAction, type PassFormState } from './actions';

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export function PassForm({ shops }: { shops: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<PassFormState, FormData>(createPassAction, {});

  if (state.pass) {
    const p = state.pass;
    return (
      <div>
        <div className="pass-card">
          <div className="pass-main">
            <div className="eyebrow">Buyer Pass{p.label ? ` · ${p.label}` : ''}</div>
            <div className="pass-code">{p.code}</div>
            <p className="muted" style={{ margin: 0 }}>
              Copy this now. For your safety it is shown only once.
            </p>
          </div>
          <div className="pass-stub">
            <div>
              <span>Per order</span>
              <strong>{money(p.perOrderCents)}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{money(p.totalCents)}</strong>
            </div>
            <div>
              <span>Expires</span>
              <strong>{new Date(p.expiresAt).toLocaleString()}</strong>
            </div>
            <div>
              <span>Shops</span>
              <strong>{p.shops}</strong>
            </div>
          </div>
        </div>
        <h2 style={{ fontSize: 20, margin: '24px 0 8px' }}>Tell your assistant</h2>
        <p className="card mono" style={{ maxWidth: 520 }}>
          When you shop for me on OpenShelf, use my Buyer Pass code {p.code}. Never spend beyond it.
        </p>
        <p className="muted" style={{ maxWidth: 520 }}>
          Your agent can only create orders inside these limits, and you still approve every payment yourself in PayPal.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card" style={{ maxWidth: 520 }}>
      <div className="field">
        <label htmlFor="label">Name this pass</label>
        <input id="label" name="label" placeholder="Weekend errands" maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="perOrder">Most it can spend on one order (USD)</label>
        <input id="perOrder" name="perOrder" type="number" min="1" step="1" defaultValue="50" required />
      </div>
      <div className="field">
        <label htmlFor="total">Most it can spend in total (USD)</label>
        <input id="total" name="total" type="number" min="1" step="1" defaultValue="100" required />
      </div>
      <div className="field">
        <label htmlFor="hours">Expires after</label>
        <select id="hours" name="hours" defaultValue="24">
          <option value="1">1 hour</option>
          <option value="24">24 hours</option>
          <option value="168">7 days</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="shop">Where it can shop</label>
        <select id="shop" name="shop" defaultValue="">
          <option value="">Any OpenShelf shop</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              Only {s.name}
            </option>
          ))}
        </select>
      </div>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? 'Creating…' : 'Create Buyer Pass'}
      </button>
    </form>
  );
}
