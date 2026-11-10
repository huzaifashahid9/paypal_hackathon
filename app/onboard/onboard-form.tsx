'use client';

import { useActionState, useMemo, useState, useTransition, type ChangeEvent } from 'react';
import { scoreReadiness } from '@/lib/readiness';
import { draftShopAction, publishShopAction, type Draft, type DraftState } from './actions';

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const EXAMPLE = {
  name: 'Maple Street Honey',
  tagline: 'Raw honey from six backyard hives',
  about:
    'Family beekeepers. Pickup on Sundays 10am to 2pm at the garden gate, or delivery by post on weekdays. ' +
    'All honey is raw and unpasteurised, so it is not suitable for children under one year. Unopened jars can be returned within 14 days.',
  catalog: `name,price,category,description
Wildflower honey 250g,9.00,honey,"Light, floral spring honey in a glass jar."
Wildflower honey 500g,16.00,honey,"Light, floral spring honey in a glass jar."
Buckwheat honey 250g,11.50,honey,"Dark and malty, harvested in late summer."
Honeycomb square,14.00,honey,"Cut comb in a 200g box. Eat the wax too."
Beeswax candle pair,12.00,candles,"Two hand-dipped 8-inch taper candles, pure beeswax."
Gift crate,48.00,gifts,"Three 250g jars, a honey dipper and a candle pair in a wooden crate."`,
  rules: `Pickup only on Sundays.
Anything over $60 needs my OK.
Refund anything under $15 automatically.
More than 10 of one item, check with me first.`,
};

export function OnboardForm({ aiOn }: { aiOn: boolean }) {
  const [state, action, pending] = useActionState<DraftState, FormData>(draftShopAction, {});
  const [dismissed, setDismissed] = useState<Draft | null>(null);
  // Controlled fields: React clears uncontrolled inputs after a form action, and the
  // merchant must find their text intact when they come back to edit.
  const [values, setValues] = useState({ name: '', tagline: '', about: '', catalog: '', rules: '' });
  const bind = (key: keyof typeof values) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  const loadFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const text = (await file.text()).slice(0, 60000);
    setValues((v) => ({ ...v, catalog: text }));
  };

  const draft = state.draft && state.draft !== dismissed ? state.draft : null;

  return (
    <>
      {draft && <Review draft={draft} onBack={() => setDismissed(draft)} />}
      <form action={action} className="card onboard-form" hidden={Boolean(draft)}>
        <div className="onboard-head">
          <h2>1. Tell us about your shop</h2>
          <button type="button" className="btn" onClick={() => setValues(EXAMPLE)}>
            Fill with an example
          </button>
        </div>
        <div className="field">
          <label htmlFor="name">Shop name</label>
          <input {...bind('name')} required minLength={2} maxLength={60} placeholder="Maple Street Honey" />
        </div>
        <div className="field">
          <label htmlFor="tagline">One line about it</label>
          <input {...bind('tagline')} maxLength={120} placeholder="Raw honey from six backyard hives" />
        </div>
        <div className="field">
          <label htmlFor="about">About: what buyers usually ask</label>
          <textarea {...bind('about')} rows={4} maxLength={2000} placeholder="Opening hours, pickup or delivery, ingredients or materials, returns." />
          <small>The shop assistant answers agents&apos; questions from this text only.</small>
        </div>
        <div className="field">
          <label htmlFor="catalog">Your products</label>
          <textarea {...bind('catalog')} rows={8} className="mono" maxLength={60000} placeholder={'name,price,category,description\nWildflower honey 250g,9.00,honey,Light floral honey'} />
          <small>
            Paste a CSV with at least <code>name</code> and <code>price</code> columns, or{' '}
            <label className="file-link">
              choose a .csv file
              <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void loadFile(e.target.files?.[0])} />
            </label>
            . {aiOn ? 'No spreadsheet? Paste your menu or price list as plain text and AI will read it.' : ''}
          </small>
        </div>
        <div className="field">
          <label htmlFor="rules">
            Your House Rules, in your own words {aiOn && <span className="chip agent">Read by AI</span>}
          </label>
          <textarea {...bind('rules')} rows={4} maxLength={2000} placeholder={'Pickup only on Sundays.\nAnything over $60 needs my OK.'} />
          <small>One rule per line. You confirm each rule before it applies.</small>
        </div>
        {state.error && !pending && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
        <button className="btn primary" disabled={pending}>
          {pending ? 'Reading your shop…' : 'Read my shop'}
        </button>
      </form>
    </>
  );
}

function Review({ draft, onBack }: { draft: Draft; onBack: () => void }) {
  const [ticked, setTicked] = useState<boolean[]>(() => draft.rules.map(() => true));
  const [error, setError] = useState('');
  const [publishing, startPublish] = useTransition();

  const readiness = useMemo(
    () => scoreReadiness({ about: draft.about, products: draft.products, rules: draft.rules.filter((_, i) => ticked[i]).map((r) => r.rule) }),
    [draft, ticked],
  );
  const missed = readiness.checks.filter((c) => c.earned < c.points);
  const tone = readiness.score >= 80 ? 'allowed' : readiness.score >= 50 ? 'held' : 'blocked';

  const publish = (): void =>
    startPublish(async () => {
      const res = await publishShopAction(draft, ticked.flatMap((on, i) => (on ? [i] : [])));
      if (res?.error) setError(res.error);
    });

  return (
    <div className="onboard-review">
      <div className="card">
        <div className="onboard-head">
          <h2>2. Check what agents will see</h2>
          <button type="button" className="btn" onClick={onBack} disabled={publishing}>
            Back to edit
          </button>
        </div>

        <h3>
          {draft.products.length} products {draft.readProductsWithAi && <span className="chip agent">Read by AI. Check the prices.</span>}
        </h3>
        <div className="table-scroll">
          <table className="plain">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="num">Price</th>
              </tr>
            </thead>
            <tbody>
              {draft.products.map((p, i) => (
                <tr key={i}>
                  <td>
                    {p.name}
                    {p.confidence < 0.8 && <span className="chip held">Check this one</span>}
                    {p.description && <div className="muted small">{p.description}</div>}
                  </td>
                  <td>{p.category}</td>
                  <td className="num mono">{money(p.priceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {draft.skipped.length > 0 && (
          <details className="skipped">
            <summary>{draft.skipped.length} line(s) were left out</summary>
            <ul>
              {draft.skipped.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        )}

        <h3>House Rules</h3>
        {draft.rules.length === 0 && <p className="muted">No rules yet. Agents can order anything in stock, on any day.</p>}
        {draft.rules.map((r, i) => (
          <label className="rule-row" key={i}>
            <input type="checkbox" checked={ticked[i]} onChange={(e) => setTicked((t) => t.map((on, j) => (j === i ? e.target.checked : on)))} />
            <span>
              <strong>{r.label}</strong>
              <span className="muted small"> from “{r.sourceText}”</span>
            </span>
          </label>
        ))}
        {draft.notUnderstood.length > 0 && (
          <p className="muted small">
            Not turned into a rule, so it will not be enforced: {draft.notUnderstood.map((s) => `“${s}”`).join(', ')}. Put it in “About” so the assistant
            can still tell agents.
          </p>
        )}
        <p className="muted small">Only ticked rules apply. Rules can hold an order for your approval. They never turn a customer away.</p>
      </div>

      <aside className="card">
        <h3 style={{ marginTop: 0 }}>Agent Readiness</h3>
        <div className={`score ${tone}`}>
          <strong>{readiness.score}</strong>
          <span>out of 100</span>
        </div>
        {missed.length === 0 ? (
          <p className="muted small">Agents have everything they need to shop here without guessing.</p>
        ) : (
          <ul className="fixes">
            {missed.map((c) => (
              <li key={c.label}>
                <strong>+{c.points - c.earned}</strong> {c.fix}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary" style={{ width: '100%' }} onClick={publish} disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish my shop'}
        </button>
        <p className="muted small">Payments run in the PayPal sandbox. No real money moves.</p>
      </aside>
    </div>
  );
}
