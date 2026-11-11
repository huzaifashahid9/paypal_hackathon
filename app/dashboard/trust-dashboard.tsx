'use client';

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type { DashboardData, DashboardOrder } from '@/lib/dashboard';
import { approveOrderAction, approveRefundAction, declineOrderAction, declineRefundAction, type ActionResult } from './actions';

ModuleRegistry.registerModules([AllCommunityModule]);

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

// AG Grid themed from the OpenShelf tokens, so it follows light and dark mode.
const gridTheme = themeQuartz.withParams({
  accentColor: 'var(--brand)',
  backgroundColor: 'var(--surface)',
  foregroundColor: 'var(--text)',
  borderColor: 'var(--border)',
  headerBackgroundColor: 'var(--bg)',
  headerTextColor: 'var(--text-muted)',
  rowHoverColor: 'color-mix(in srgb, var(--brand) 8%, transparent)',
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  wrapperBorderRadius: 12,
  spacing: 8,
});

const STATUS: Record<string, { label: string; tone: 'allowed' | 'held' | 'blocked' | 'muted' }> = {
  paid: { label: 'Paid', tone: 'allowed' },
  awaiting_payment: { label: 'Awaiting payment', tone: 'muted' },
  held: { label: 'Held for you', tone: 'held' },
  refunded: { label: 'Refunded', tone: 'muted' },
  declined: { label: 'Declined', tone: 'blocked' },
};

function StatusCell({ value }: ICellRendererParams<DashboardOrder, string>) {
  const s = STATUS[value ?? ''] ?? { label: value ?? '', tone: 'muted' as const };
  return <span className={`chip ${s.tone}`}>{s.label}</span>;
}

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function TrustDashboard({ initial, shops }: { initial: DashboardData; shops: { slug: string; name: string }[] }) {
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(() => Date.parse(initial.orders[0]?.createdAt ?? '2026-01-01'));
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/dashboard?shop=${encodeURIComponent(initial.shop.slug)}`, { cache: 'no-store' });
    if (res.ok) setData((await res.json()) as DashboardData);
    setNow(Date.now());
  }, [initial.shop.slug]);

  // Live view: poll every 2 seconds. Simple, and good enough for a shop's order volume.
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const act = (fn: (id: string) => Promise<ActionResult>, id: string) =>
    startTransition(async () => {
      setError(null);
      const r = await fn(id);
      if (!r.ok) setError(r.error);
      await refresh();
    });

  const columns = useMemo<ColDef<DashboardOrder>[]>(
    () => [
      { field: 'createdAt', headerName: 'When', width: 110, valueFormatter: (p) => ago(p.value as string, now) },
      { field: 'status', headerName: 'Status', width: 170, cellRenderer: StatusCell },
      { field: 'agent', headerName: 'Agent', width: 130 },
      { field: 'items', headerName: 'Items', flex: 2, minWidth: 200 },
      { field: 'totalCents', headerName: 'Total', width: 110, type: 'rightAligned', cellClass: 'mono', valueFormatter: (p) => money(p.value as number) },
      { field: 'fulfillment', headerName: 'Fulfillment', width: 170 },
      { field: 'paypalCaptureId', headerName: 'PayPal capture', width: 190, cellClass: 'mono' },
    ],
    [now],
  );

  const k = data.kpis;
  return (
    <main className="dash">
      <header className="dash-top">
        <div>
          <div className="eyebrow">Trust Dashboard</div>
          <h1>{data.shop.name}</h1>
        </div>
        <nav className="shop-switch" aria-label="Shops">
          {shops.map((s) => (
            <a key={s.slug} href={`/dashboard?shop=${s.slug}`} aria-current={s.slug === data.shop.slug ? 'page' : undefined}>
              {s.name}
            </a>
          ))}
        </nav>
        <span className="live">
          <span className="live-dot" /> Live
        </span>
      </header>

      <section className="kpis">
        <div className="kpi"><span>Agent orders paid</span><strong>{k.paidOrders}</strong></div>
        <div className="kpi"><span>Revenue</span><strong className="mono">{money(k.revenueCents)}</strong></div>
        <div className="kpi held"><span>Held for you</span><strong>{k.held}</strong></div>
        <div className="kpi blocked"><span>Blocked by buyer limits</span><strong>{k.blocked}</strong></div>
        <div className="kpi"><span>Refunded</span><strong className="mono">{money(k.refundedCents)}</strong></div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="dash-grid">
        <div className="card flush">
          <h2>Agent orders</h2>
          <div style={{ height: 420 }}>
            <AgGridReact<DashboardOrder> theme={gridTheme} rowData={data.orders} columnDefs={columns} getRowId={(p) => p.data.id} animateRows overlayNoRowsTemplate="No agent orders yet. Connect an agent to this shop's MCP URL." />
          </div>
        </div>

        <aside className="side">
          <div className="card">
            <h2>Needs your OK</h2>
            {data.heldOrders.length === 0 && data.pendingRefunds.length === 0 && <p className="muted">Nothing is waiting on you.</p>}
            {data.heldOrders.map((o) => (
              <div className="queue-item" key={o.id}>
                <div className="queue-head"><span className="chip held">Held order</span><strong className="mono">{money(o.totalCents)}</strong></div>
                <p>{o.items}</p>
                <p className="muted">{o.reason}</p>
                {o.buyerNote && <p className="muted">Buyer note: {o.buyerNote}</p>}
                <div className="actions">
                  <button className="btn primary" disabled={busy} onClick={() => act(approveOrderAction, o.id)}>Approve</button>
                  <button className="btn" disabled={busy} onClick={() => act(declineOrderAction, o.id)}>Decline</button>
                </div>
              </div>
            ))}
            {data.pendingRefunds.map((r) => (
              <div className="queue-item" key={r.id}>
                <div className="queue-head"><span className="chip held">Refund request</span><strong className="mono">{money(r.amountCents)}</strong></div>
                <p>{r.reason}</p>
                <div className="actions">
                  <button className="btn primary" disabled={busy} onClick={() => act(approveRefundAction, r.id)}>Refund via PayPal</button>
                  <button className="btn" disabled={busy} onClick={() => act(declineRefundAction, r.id)}>Decline</button>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Blocked attempts</h2>
            {data.blocked.length === 0 && <p className="muted">No agent has hit a buyer limit.</p>}
            {data.blocked.slice(0, 6).map((b) => (
              <div className="queue-item" key={b.id}>
                <div className="queue-head"><span className="chip blocked">Blocked</span><span className="muted">{ago(b.at, now)} · {b.agent}</span></div>
                <p>{b.message}</p>
                <code>{b.rule}</code>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
