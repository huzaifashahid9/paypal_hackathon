'use client';

import { useEffect, useState, useTransition } from 'react';
import type { DemoRun, Scenario } from '@/lib/mystery-shopper';
import { runDemoAction } from './actions';

const CHIP: Record<Scenario['outcome'], [string, string]> = {
  allowed: ['allowed', 'Allowed'],
  held: ['held', 'Held for the merchant'],
  blocked: ['blocked', 'Blocked by the buyer’s pass'],
  error: ['muted', 'Could not finish'],
};

const WHY: Record<Scenario['key'], string> = {
  allowed: 'Inside the buyer’s budget and every House Rule, so PayPal takes over. The buyer still approves the payment.',
  held: 'The buyer can afford it, but the bakery reviews orders over $75. The sale is not lost. It waits for the baker.',
  blocked: 'The buyer’s own pass says $50 per order. No agent, and no shop, can spend past it.',
};

const isPayPalUrl = (url: string | undefined): url is string => {
  try {
    return Boolean(url) && /(^|\.)paypal\.com$/.test(new URL(url!).hostname);
  } catch {
    return false;
  }
};

export function DemoRunner({ paypalOn }: { paypalOn: boolean }) {
  const [run, setRun] = useState<DemoRun | null>(null);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(0);
  const [pending, start] = useTransition();

  const total = run ? run.scenarios.reduce((n, s) => n + s.calls.length + 1, 0) : 0;

  // Reveal the transcript one line at a time, like watching the agent work.
  useEffect(() => {
    if (!run || shown >= total) return;
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setShown(instant ? total : shown + 1), instant ? 0 : 450);
    return () => clearTimeout(t);
  }, [run, shown, total]);

  const go = (): void =>
    start(async () => {
      setError('');
      const res = await runDemoAction();
      if (res.run) {
        setShown(0);
        setRun(res.run);
      } else setError(res.error ?? 'The demo could not run.');
    });

  let line = 0;
  return (
    <div>
      <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn primary big" onClick={go} disabled={pending || (run !== null && shown < total)}>
          {pending ? 'Shopping…' : run ? 'Run it again' : 'Run the demo'}
        </button>
        <a className="btn big" href="/dashboard?shop=rosies-bakery" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
          Open the Trust Dashboard in a new tab
        </a>
      </p>
      {!paypalOn && (
        <p className="error" role="status">
          PayPal sandbox keys are not set on this server, so the allowed order cannot open a PayPal payment. The held and blocked outcomes still work.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {run && (
        <div className="demo-grid" aria-live="polite">
          {run.scenarios.map((s, i) => {
            const first = line;
            line += s.calls.length + 1;
            const done = shown >= line;
            if (shown <= first) return <section className="card demo-card waiting" key={s.key} aria-hidden />;
            const [tone, label] = CHIP[s.outcome];
            return (
              <section className="card demo-card" key={s.key}>
                <div className="queue-head">
                  <span className="muted">Order {i + 1}</span>
                  <span className="chip muted">{s.setup}</span>
                </div>
                <h2>{s.title}</h2>
                <ol className="transcript">
                  {s.calls.slice(0, shown - first).map((c, j) => (
                    <li key={j}>
                      <span className="chip agent">{c.tool}</span>
                      <span>{c.reply}</span>
                    </li>
                  ))}
                </ol>
                {done && (
                  <div className={`verdict ${tone}`}>
                    <span className={`chip ${tone}`}>{label}</span>
                    <p>{s.outcome === 'error' ? s.summary : WHY[s.key]}</p>
                    {s.outcome === 'allowed' && isPayPalUrl(s.approveUrl) && (
                      <a className="btn primary" href={s.approveUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                        Pay as the buyer in PayPal sandbox
                      </a>
                    )}
                    {s.outcome === 'held' && (
                      <a className="btn" href={`/dashboard?shop=${run.shopSlug}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                        Approve it as the baker
                      </a>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {run && shown >= total && (
        <p className="muted small" style={{ marginTop: 16 }}>
          Pickup date used: {run.pickupDate}, the next Saturday, because {run.shopName} only offers Saturday pickup. Every decision above was made by
          code, not by an AI model, and is in the Trust Dashboard.
        </p>
      )}
    </div>
  );
}
