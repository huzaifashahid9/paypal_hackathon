import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { formatCents } from '@/lib/money';
import { describeRule } from '@/lib/policy/rules';
import { scoreReadiness } from '@/lib/readiness';
import { getHouseRules, getShopBySlug, listProducts } from '@/lib/shops';
import { CopyButton } from './copy-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ shop: string }> }) {
  const shop = await getShopBySlug((await params).shop);
  return { title: shop ? `${shop.name} · OpenShelf` : 'OpenShelf' };
}

/** Public shop page: what agents can buy here, the House Rules, and how to connect an agent. */
export default async function ShopPage({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<{ new?: string }> }) {
  const shop = await getShopBySlug((await params).shop);
  if (!shop || !shop.publishedAt) notFound();
  const [products, rules, h, query] = await Promise.all([listProducts(shop.id), getHouseRules(shop.id), headers(), searchParams]);

  const origin = process.env.APP_URL?.replace(/\/$/, '') || `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const mcpUrl = `${origin}/s/${shop.slug}/mcp`;
  const readiness = scoreReadiness({ about: shop.about, products, rules });
  const missed = readiness.checks.filter((c) => c.earned < c.points);
  const tone = readiness.score >= 80 ? 'allowed' : readiness.score >= 50 ? 'held' : 'blocked';

  return (
    <main className="page wide">
      {query.new && (
        <p className="banner" role="status">
          <strong>{shop.name} is live.</strong> AI agents can now browse it and place orders inside your rules.
        </p>
      )}
      <div className="eyebrow">Agent-ready shop</div>
      <h1 style={{ fontSize: 40, margin: '8px 0 4px' }}>{shop.name}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{shop.tagline}</p>

      <div className="shop-grid">
        <div className="side">
          <section className="card">
            <h2>Connect an AI agent</h2>
            <p>Add this address as a custom connector (MCP server) in Claude, ChatGPT or any MCP client.</p>
            <div className="copy-row">
              <code>{mcpUrl}</code>
              <CopyButton text={mcpUrl} />
            </div>
            <p style={{ marginTop: 12 }}>
              Buyers give their agent a <a href="/pass">Buyer Pass</a> first. It caps what the agent can spend.
            </p>
          </section>

          <section className="card">
            <h2>What agents can buy</h2>
            <div className="table-scroll">
              <table className="plain">
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.name} {!p.inStock && <span className="chip muted">Out of stock</span>}
                        {p.description && <div className="muted small">{p.description}</div>}
                      </td>
                      <td>{p.category}</td>
                      <td className="num mono">{formatCents(p.priceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="side">
          <section className="card">
            <h2>Agent Readiness</h2>
            <div className={`score ${tone}`}>
              <strong>{readiness.score}</strong>
              <span>out of 100</span>
            </div>
            {missed.length === 0 ? (
              <p>Agents have everything they need to shop here without guessing.</p>
            ) : (
              <ul className="fixes">
                {missed.map((c) => (
                  <li key={c.label}>
                    <strong>+{c.points - c.earned}</strong> {c.fix}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2>House Rules</h2>
            {rules.length === 0 && <p>No rules. Agents can order anything in stock.</p>}
            <ul className="rule-list">
              {rules.map((r, i) => (
                <li key={i}>{describeRule(r)}</li>
              ))}
            </ul>
            <a className="btn" href={`/dashboard?shop=${shop.slug}`} style={{ textDecoration: 'none', display: 'inline-block', marginTop: 8 }}>
              Open the Trust Dashboard
            </a>
          </section>
        </aside>
      </div>
    </main>
  );
}
