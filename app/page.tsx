import { connection } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { seedDemoShops } from '@/lib/seed';

export default async function Home() {
  await connection();
  const db = await getDb();
  await seedDemoShops(db);
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
      </section>
      <section className="cards">
        {shops.map((shop) => (
          <div className="card" key={shop.id}>
            <h2>{shop.name}</h2>
            <p>{shop.tagline}</p>
            <code>/s/{shop.slug}/mcp</code>
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
