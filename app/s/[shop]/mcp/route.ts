import { createHash } from 'node:crypto';
import { serveShopMcp } from '@/lib/mcp/http';
import { getShopBySlug } from '@/lib/shops';

export const dynamic = 'force-dynamic';

function agentName(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('claude')) return 'Claude';
  if (ua.includes('openai') || ua.includes('chatgpt')) return 'ChatGPT';
  if (ua.includes('openshelf-mystery-shopper')) return 'Mystery Shopper';
  if (ua.includes('cursor')) return 'Cursor';
  return userAgent.split(/[\/\s]/)[0]?.slice(0, 40) || 'MCP client';
}

/** One MCP endpoint per shop: /s/{shop}/mcp. Stateless Streamable HTTP, JSON responses. */
export async function POST(request: Request, { params }: { params: Promise<{ shop: string }> }): Promise<Response> {
  const { shop: slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop || !shop.publishedAt) return Response.json({ error: 'No such shop' }, { status: 404 });

  const userAgent = request.headers.get('user-agent') ?? '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  // Groups one agent's calls to one shop on one day into a replayable session.
  const day = new Date().toISOString().slice(0, 10);
  const sessionId = request.headers.get('x-openshelf-session') ?? createHash('sha256').update(`${shop.id}|${userAgent}|${ip}|${day}`).digest('hex').slice(0, 16);

  return serveShopMcp(shop, request, { agentClient: agentName(userAgent), sessionId });
}

const notAllowed = (): Response => Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Use POST.' }, id: null }, { status: 405, headers: { Allow: 'POST' } });

export const GET = notAllowed;
export const DELETE = notAllowed;
