import type { HouseRule } from '@/lib/policy/rules';

// Fictional demo shops. Names and products are invented and imitate no real business.

export type SeedShop = {
  slug: string;
  name: string;
  tagline: string;
  about: string;
  rules: { rule: HouseRule; sourceText: string }[];
  products: { name: string; category: string; priceCents: number; description: string }[];
};

export const SEED_SHOPS: SeedShop[] = [
  {
    slug: 'rosies-bakery',
    name: "Rosie's Bakery",
    tagline: 'Small-batch sourdough, baked Friday night',
    about:
      'Home bakery. Pickup only, Saturdays 9am to 1pm, from the side door at the kitchen. No delivery. ' +
      'Everything is baked in a kitchen that handles wheat, eggs, milk and tree nuts. ' +
      'The seeded rye and the oat cookies contain no dairy. Nothing is gluten-free. ' +
      'Celebration cakes need 3 days notice and are confirmed personally by Rosie.',
    rules: [
      { rule: { type: 'fulfillment_window', method: 'pickup', days: [6] }, sourceText: 'Saturday pickup only.' },
      { rule: { type: 'hold_above_amount', cents: 7500 }, sourceText: 'Anything over $75 needs my OK.' },
      { rule: { type: 'excluded_category', category: 'catering' }, sourceText: 'No catering orders through agents.' },
      { rule: { type: 'auto_refund_below', cents: 2000 }, sourceText: 'Refund anything under $20 automatically.' },
    ],
    products: [
      { name: 'Sourdough roll', category: 'bread', priceCents: 150, description: 'Crusty white sourdough roll, about 90g. Contains wheat.' },
      { name: 'Country sourdough loaf', category: 'bread', priceCents: 900, description: '800g loaf, 24-hour ferment. Contains wheat.' },
      { name: 'Seeded rye loaf', category: 'bread', priceCents: 1000, description: 'Dense rye with sunflower and flax. Dairy-free. Contains wheat and rye.' },
      { name: 'Butter croissant', category: 'pastry', priceCents: 375, description: 'Laminated with cultured butter. Contains wheat, milk, egg.' },
      { name: 'Almond croissant', category: 'pastry', priceCents: 450, description: 'Twice-baked with almond cream. Contains wheat, milk, egg, almonds.' },
      { name: 'Cinnamon bun', category: 'pastry', priceCents: 400, description: 'Soft bun with brown sugar and cinnamon. Contains wheat, milk, egg.' },
      { name: 'Oat cookie (box of 6)', category: 'cookies', priceCents: 1200, description: 'Chewy oat and raisin cookies. Dairy-free. Contains wheat and oats.' },
      { name: 'Celebration cake', category: 'cakes', priceCents: 12000, description: '8-inch layered vanilla cake with a custom message, serves 12. Needs 3 days notice.' },
      { name: 'Office breakfast tray', category: 'catering', priceCents: 6500, description: 'Assorted pastries for 10 people.' },
    ],
  },
  {
    slug: 'wick-and-wax',
    name: 'Wick & Wax',
    tagline: 'Hand-poured soy candles',
    about:
      'Candles are poured to order and ship within 3 business days by tracked post, any weekday. ' +
      'All candles are soy wax with cotton wicks, about 40 hours burn time for the 8oz size. ' +
      'Unlit candles can be returned within 14 days.',
    rules: [
      { rule: { type: 'fulfillment_window', method: 'delivery', days: [1, 2, 3, 4, 5] }, sourceText: 'We ship on weekdays only.' },
      { rule: { type: 'max_quantity_per_item', quantity: 6 }, sourceText: 'More than 6 of one candle, check with me first.' },
      { rule: { type: 'auto_refund_below', cents: 3000 }, sourceText: 'Refund up to $30 without asking.' },
    ],
    products: [
      { name: 'Cedar & Smoke candle 8oz', category: 'candles', priceCents: 2400, description: 'Cedarwood, vetiver and a little smoke.' },
      { name: 'Fig Leaf candle 8oz', category: 'candles', priceCents: 2400, description: 'Green fig, blackcurrant leaf.' },
      { name: 'Sea Salt & Sage candle 8oz', category: 'candles', priceCents: 2400, description: 'Clean, mineral and herbal.' },
      { name: 'Orange Peel & Clove candle 8oz', category: 'candles', priceCents: 2600, description: 'Warm winter citrus.' },
      { name: 'Unscented pillar candle', category: 'candles', priceCents: 1400, description: 'Plain soy pillar, 3 inches.' },
      { name: 'Mini trio gift set', category: 'gift sets', priceCents: 3200, description: 'Three 2oz candles: Cedar & Smoke, Fig Leaf, Sea Salt & Sage.' },
      { name: 'Brass wick trimmer', category: 'accessories', priceCents: 1600, description: 'Keeps wicks at a clean quarter inch.' },
    ],
  },
  {
    slug: 'little-leaf-books',
    name: 'Little Leaf Books',
    tagline: 'Secondhand paperbacks, one copy of each',
    about:
      'Secondhand books in good condition unless noted. One copy of each title. ' +
      'Posted on Mondays and Thursdays, or pickup on Saturday from the market stall. ' +
      'Returns accepted within 7 days if the condition was not as described.',
    rules: [
      { rule: { type: 'fulfillment_window', method: 'any', days: [1, 4, 6] }, sourceText: 'Post goes Monday and Thursday, stall is Saturday.' },
      { rule: { type: 'hold_above_amount', cents: 6000 }, sourceText: 'Big orders over $60, let me check stock first.' },
      { rule: { type: 'auto_refund_below', cents: 1500 }, sourceText: 'Refund up to $15 automatically.' },
    ],
    products: [
      { name: 'A Field Guide to Getting Lost (paperback)', category: 'non-fiction', priceCents: 700, description: 'Good condition, light shelf wear.' },
      { name: 'The Left Hand of Darkness (paperback)', category: 'science fiction', priceCents: 650, description: 'Very good condition.' },
      { name: 'Pride and Prejudice (paperback)', category: 'classics', priceCents: 400, description: 'Good condition, name on first page.' },
      { name: 'The Remains of the Day (paperback)', category: 'fiction', priceCents: 600, description: 'Very good condition.' },
      { name: 'Salt, Fat, Acid, Heat (hardback)', category: 'cookery', priceCents: 1800, description: 'Like new.' },
      { name: 'The Hobbit (illustrated hardback)', category: 'fantasy', priceCents: 2200, description: 'Good condition, dust jacket has a small tear.' },
      { name: 'Mystery bundle of 5 paperbacks', category: 'bundles', priceCents: 1500, description: 'Five crime novels picked by the shop.' },
    ],
  },
];
