import { connection } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { loadDashboard } from '@/lib/dashboard';
import { TrustDashboard } from './trust-dashboard';

type Props = { searchParams: Promise<{ shop?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  await connection();
  const { shop } = await searchParams;
  const db = await getDb();
  const shops = await db.select({ slug: schema.shops.slug, name: schema.shops.name }).from(schema.shops);
  const slug = shop && shops.some((s) => s.slug === shop) ? shop : shops[0]?.slug;
  const data = slug ? await loadDashboard(slug) : null;
  if (!data) return <main className="page">No shops yet.</main>;
  return <TrustDashboard initial={data} shops={shops} />;
}
