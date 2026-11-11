import { connection } from 'next/server';
import { getDb, schema } from '@/lib/db';

export default async function Home() {
  await connection();
  const db = await getDb();
  const shops = await db.select().from(schema.shops);

  return (
    <main className="page">
      <section className="hero">
        <div className="eyebrow">OpenShelf</div>
        <h1>Make your shop buyable by AI agents, safely.</h1>
        <p>
          Agent-ready in 60 seconds and paid through PayPal. The merchant decides what agents can buy. The buyer decides
          what their agent can spend.
        </p>
        <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
          <a className="btn primary" href="/onboard" style={{ textDecoration: 'none' }}>
            Open your shop to agents
          </a>
          <a className="btn" href="/demo" style={{ textDecoration: 'none' }}>
            Run the one-click demo
          </a>
          <a className="btn" href="/dashboard" style={{ textDecoration: 'none' }}>
            Open the Trust Dashboard
          </a>
          <a className="btn" href="/pass" style={{ textDecoration: 'none' }}>
            Create a Buyer Pass
          </a>
        </p>
      </section>
      <section className="cards">
        {shops.map((shop) => (
          <div className="card" key={shop.id}>
            <h2>{shop.name}</h2>
            <p>{shop.tagline}</p>
            <a href={`/s/${shop.slug}`}>View shop</a>
          </div>
        ))}
      </section>
      <p style={{ marginTop: 32 }}>
        <span className="chip allowed">Allowed</span> <span className="chip held">Held</span>{' '}
        <span className="chip blocked">Blocked</span>
      </p>
    </main>
  );
}
