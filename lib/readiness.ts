// Agent Readiness Score: how well an AI agent can shop here without guessing.
// Pure code so the score is repeatable and every lost point comes with a fix.

import type { HouseRule } from '@/lib/policy/rules';

export type ReadinessInput = {
  about: string;
  products: { name: string; category: string; description: string }[];
  rules: HouseRule[];
};

export type ReadinessCheck = { label: string; points: number; earned: number; fix: string };
export type Readiness = { score: number; checks: ReadinessCheck[] };

const share = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);

export function scoreReadiness(input: ReadinessInput): Readiness {
  const { about, products, rules } = input;
  const has = (type: HouseRule['type']): boolean => rules.some((r) => r.type === type);
  const described = products.filter((p) => p.description.trim().length >= 20).length;
  const categorised = products.filter((p) => p.category && p.category !== 'general').length;

  const raw: [string, number, number, string][] = [
    ['A catalog agents can browse', 15, Math.min(1, products.length / 3), 'Add at least 3 products.'],
    ['Products are described', 20, share(described, products.length), `${products.length - described} product(s) need a description of a sentence or more. Agents quote it to buyers.`],
    ['Products have categories', 10, share(categorised, products.length), `${products.length - categorised} product(s) have no category. Categories make search and rules work.`],
    ['Says how orders are handed over', 15, /\b(pick ?up|collect|deliver|ship|post)/i.test(about) ? 1 : 0, 'Say in "About" whether you offer pickup, delivery or shipping, and when.'],
    ['Answers common questions', 10, Math.min(1, about.trim().length / 120), 'Add a few lines to "About": hours, ingredients or materials, returns.'],
    ['Pickup or delivery days are a rule', 10, has('fulfillment_window') ? 1 : 0, 'Add a rule like "Pickup only on Saturdays" so agents cannot book a day you are closed.'],
    ['Large orders need your approval', 10, has('hold_above_amount') ? 1 : 0, 'Add a rule like "Orders over $75 need my OK".'],
    ['Refund rule is set', 10, has('auto_refund_below') ? 1 : 0, 'Add a rule like "Refund anything under $20 automatically".'],
  ];

  const checks = raw.map(([label, points, fraction, fix]) => ({ label, points, earned: Math.round(points * fraction), fix }));
  return { score: checks.reduce((n, c) => n + c.earned, 0), checks };
}
