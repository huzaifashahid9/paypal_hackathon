import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Caller } from '@/lib/orders';
import type { Shop } from '@/lib/shops';
import { buildShopServer } from './server';

/** Answer one MCP request for a shop. Stateless Streamable HTTP with JSON responses. */
export async function serveShopMcp(shop: Shop, request: Request, caller: Caller): Promise<Response> {
  const server = await buildShopServer(shop, caller);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
