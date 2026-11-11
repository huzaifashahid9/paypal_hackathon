import { loadDashboard } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

// Demo note: there are no merchant accounts yet, so this is readable by anyone who knows the slug.
export async function GET(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get('shop') ?? '';
  const data = await loadDashboard(slug);
  if (!data) return Response.json({ error: 'No such shop' }, { status: 404 });
  return Response.json(data, { headers: { 'cache-control': 'no-store' } });
}
