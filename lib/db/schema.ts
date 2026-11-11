import { boolean, integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import type { HouseRule } from '@/lib/policy/rules';

export type OrderItem = {
  productId: string;
  name: string;
  category: string;
  quantity: number;
  unitCents: number;
};

export type Fulfillment = {
  method: 'pickup' | 'delivery';
  /** ISO date, e.g. 2026-11-14 */
  date: string;
  time?: string;
};

export type OrderStatus = 'held' | 'awaiting_payment' | 'paid' | 'refunded' | 'declined';

export const shops = pgTable('shops', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull().default(''),
  /** Free-text facts the shop assistant may answer from (hours, pickup, allergens). */
  about: text('about').notNull().default(''),
  sourceUrl: text('source_url'),
  readinessScore: integer('readiness_score').notNull().default(0),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull(),
  paypalProductId: text('paypal_product_id'),
  name: text('name').notNull(),
  category: text('category').notNull().default('general'),
  priceCents: integer('price_cents').notNull(),
  description: text('description').notNull().default(''),
  imageUrl: text('image_url'),
  inStock: boolean('in_stock').notNull().default(true),
  confidence: real('confidence').notNull().default(1),
});

export const houseRules = pgTable('house_rules', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull(),
  rule: jsonb('rule').$type<HouseRule>().notNull(),
  /** The merchant's own words this rule was translated from. */
  sourceText: text('source_text').notNull().default(''),
  confirmed: boolean('confirmed').notNull().default(false),
});

export const buyerPasses = pgTable('buyer_passes', {
  id: text('id').primaryKey(),
  codeHash: text('code_hash').notNull().unique(),
  codeHint: text('code_hint').notNull(),
  label: text('label').notNull().default(''),
  perOrderCents: integer('per_order_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  /** null means every shop is allowed. */
  allowedShopIds: jsonb('allowed_shop_ids').$type<string[] | null>(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked: boolean('revoked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull(),
  passId: text('pass_id').notNull(),
  status: text('status').$type<OrderStatus>().notNull(),
  items: jsonb('items').$type<OrderItem[]>().notNull(),
  totalCents: integer('total_cents').notNull(),
  fulfillment: jsonb('fulfillment').$type<Fulfillment>().notNull(),
  buyerNote: text('buyer_note').notNull().default(''),
  holdReason: text('hold_reason'),
  paypalOrderId: text('paypal_order_id'),
  paypalCaptureId: text('paypal_capture_id'),
  approveUrl: text('approve_url'),
  agentClient: text('agent_client').notNull().default('unknown'),
  sessionId: text('session_id'),
  receiptSig: text('receipt_sig'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull(),
  passId: text('pass_id'),
  orderId: text('order_id'),
  outcome: text('outcome').$type<'allowed' | 'held' | 'blocked'>().notNull(),
  rule: text('rule').notNull(),
  limitCents: integer('limit_cents'),
  attemptedCents: integer('attempted_cents'),
  message: text('message').notNull(),
  agentClient: text('agent_client').notNull().default('unknown'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const refunds = pgTable('refunds', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason').notNull().default(''),
  status: text('status').$type<'refunded' | 'pending_merchant' | 'declined'>().notNull(),
  paypalRefundId: text('paypal_refund_id'),
  aiSuggestion: text('ai_suggestion'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  sessionId: text('session_id'),
  shopId: text('shop_id'),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
