/** Plain SQL kept next to schema.ts so a fresh database needs no migration tooling. */
export const DDL = `
CREATE TABLE IF NOT EXISTS shops (
  id text PRIMARY KEY, slug text NOT NULL UNIQUE, name text NOT NULL,
  tagline text NOT NULL DEFAULT '', about text NOT NULL DEFAULT '', source_url text,
  readiness_score integer NOT NULL DEFAULT 0, published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY, shop_id text NOT NULL, paypal_product_id text, name text NOT NULL,
  category text NOT NULL DEFAULT 'general', price_cents integer NOT NULL,
  description text NOT NULL DEFAULT '', image_url text, in_stock boolean NOT NULL DEFAULT true,
  confidence real NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS house_rules (
  id text PRIMARY KEY, shop_id text NOT NULL, rule jsonb NOT NULL,
  source_text text NOT NULL DEFAULT '', confirmed boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS buyer_passes (
  id text PRIMARY KEY, code_hash text NOT NULL UNIQUE, code_hint text NOT NULL,
  label text NOT NULL DEFAULT '', per_order_cents integer NOT NULL, total_cents integer NOT NULL,
  allowed_shop_ids jsonb, expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY, shop_id text NOT NULL, pass_id text NOT NULL, status text NOT NULL,
  items jsonb NOT NULL, total_cents integer NOT NULL, fulfillment jsonb NOT NULL,
  buyer_note text NOT NULL DEFAULT '', hold_reason text, paypal_order_id text,
  paypal_capture_id text, approve_url text, agent_client text NOT NULL DEFAULT 'unknown',
  session_id text, receipt_sig text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS decisions (
  id text PRIMARY KEY, shop_id text NOT NULL, pass_id text, order_id text, outcome text NOT NULL,
  rule text NOT NULL, limit_cents integer, attempted_cents integer, message text NOT NULL,
  agent_client text NOT NULL DEFAULT 'unknown', at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refunds (
  id text PRIMARY KEY, order_id text NOT NULL, amount_cents integer NOT NULL,
  reason text NOT NULL DEFAULT '', status text NOT NULL, paypal_refund_id text,
  ai_suggestion text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY, session_id text, shop_id text, type text NOT NULL,
  payload jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_shop_idx ON products (shop_id);
CREATE INDEX IF NOT EXISTS orders_shop_idx ON orders (shop_id, created_at);
CREATE INDEX IF NOT EXISTS orders_pass_idx ON orders (pass_id);
CREATE INDEX IF NOT EXISTS decisions_shop_idx ON decisions (shop_id, at);
CREATE INDEX IF NOT EXISTS events_session_idx ON events (session_id, at)
`;
