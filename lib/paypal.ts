// PayPal REST client (sandbox). Every call OpenShelf makes to PayPal goes through this file,
// with plain fetch and no SDK. Server-side only: it reads the client secret from the environment.

import { centsToPayPal } from '@/lib/money';

const BASE_URL = process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com';
const MAX_ATTEMPTS = 4;

export class PayPalApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`PayPal ${status} on ${path}: ${body.slice(0, 300)}`);
    this.name = 'PayPalApiError';
  }
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
}

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  const { PAYPAL_CLIENT_ID: id, PAYPAL_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_SECRET must be set (see .env.example)');

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!res.ok) throw new PayPalApiError(res.status, '/v1/oauth2/token', await res.text());
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh a minute early so an in-flight request never carries an expired token.
  cachedToken = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

type CallOptions = { method?: 'GET' | 'POST'; body?: unknown; requestId?: string };

async function call<T>(path: string, { method = 'GET', body, requestId }: CallOptions = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    // PayPal-Request-Id makes a POST idempotent: a retry with the same id never charges twice.
    if (requestId) headers['PayPal-Request-Id'] = requestId;
    if (method === 'POST') headers.Prefer = 'return=representation';

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;

    // A revoked or expired token: drop it and mint a new one once.
    if (res.status === 401 && attempt === 1) {
      cachedToken = undefined;
      continue;
    }
    // Retrying a POST is only safe when it carries an idempotency key.
    const retryable = method === 'GET' || Boolean(requestId);
    if (retryable && (res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 250));
      continue;
    }
    throw new PayPalApiError(res.status, path, await res.text());
  }
}

export type Money = { currency_code: string; value: string };
type Link = { href: string; rel: string; method?: string };

const usd = (cents: number): Money => ({ currency_code: 'USD', value: centsToPayPal(cents) });

// ---- Catalog Products ------------------------------------------------------

export type CatalogProduct = { id: string; name: string };

export async function createCatalogProduct(input: {
  requestId: string;
  name: string;
  description?: string;
  imageUrl?: string | null;
  homeUrl?: string | null;
}): Promise<CatalogProduct> {
  return call<CatalogProduct>('/v1/catalogs/products', {
    method: 'POST',
    requestId: input.requestId,
    body: {
      name: input.name.slice(0, 127),
      description: input.description?.slice(0, 256) || undefined,
      type: 'PHYSICAL',
      image_url: input.imageUrl?.startsWith('https://') ? input.imageUrl : undefined,
      home_url: input.homeUrl?.startsWith('https://') ? input.homeUrl : undefined,
    },
  });
}

// ---- Orders v2 -------------------------------------------------------------

export type PayPalOrder = {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links?: Link[];
  purchase_units?: {
    custom_id?: string;
    payments?: { captures?: { id: string; status: string; amount: Money }[] };
  }[];
};

export type CreateOrderInput = {
  /** Our order id: used as custom_id and as the idempotency key. */
  orderId: string;
  shopName: string;
  items: { name: string; quantity: number; unitCents: number }[];
  totalCents: number;
  returnUrl: string;
  cancelUrl: string;
};

export async function createOrder(input: CreateOrderInput): Promise<{ id: string; approveUrl: string }> {
  const order = await call<PayPalOrder>('/v2/checkout/orders', {
    method: 'POST',
    requestId: `order-${input.orderId}`,
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.orderId,
          custom_id: input.orderId,
          description: `${input.shopName} via OpenShelf`.slice(0, 127),
          amount: { ...usd(input.totalCents), breakdown: { item_total: usd(input.totalCents) } },
          items: input.items.map((i) => ({
            name: i.name.slice(0, 127),
            quantity: String(i.quantity),
            unit_amount: usd(i.unitCents),
          })),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: input.shopName.slice(0, 127),
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  const approveUrl = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  if (!approveUrl) throw new Error(`PayPal order ${order.id} came back without an approval link`);
  return { id: order.id, approveUrl };
}

export function getOrder(paypalOrderId: string): Promise<PayPalOrder> {
  return call<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
}

/** Capture an order the buyer has approved. Returns the capture id needed for refunds. */
export async function captureOrder(paypalOrderId: string): Promise<{ captureId: string; status: string; amountCents: number }> {
  const order = await call<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    requestId: `capture-${paypalOrderId}`,
    body: {},
  });
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) throw new Error(`PayPal order ${paypalOrderId} has no capture after capture call`);
  return { captureId: capture.id, status: capture.status, amountCents: Math.round(parseFloat(capture.amount.value) * 100) };
}

// ---- Refunds ---------------------------------------------------------------

export async function refundCapture(input: { captureId: string; refundId: string; amountCents: number; note?: string }): Promise<{ id: string; status: string }> {
  return call<{ id: string; status: string }>(`/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`, {
    method: 'POST',
    requestId: `refund-${input.refundId}`,
    body: { amount: usd(input.amountCents), note_to_payer: input.note?.slice(0, 255) || undefined },
  });
}

// ---- Webhooks --------------------------------------------------------------

/** Ask PayPal whether a webhook really came from PayPal. Never trust an unverified event. */
export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const res = await call<{ verification_status: string }>('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: {
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  return res.verification_status === 'SUCCESS';
}
