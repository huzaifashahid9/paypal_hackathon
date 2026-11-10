import { getDb } from '@/lib/db';
import { seedDemoShops } from '@/lib/seed';

const db = await getDb();
const { created } = await seedDemoShops(db);
console.log(created.length ? `Seeded: ${created.join(', ')}` : 'Demo shops already present.');
process.exit(0);
