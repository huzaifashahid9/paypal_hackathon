'use server';

import { runMysteryShopper, type DemoRun } from '@/lib/mystery-shopper';

export async function runDemoAction(): Promise<{ run?: DemoRun; error?: string }> {
  try {
    return { run: await runMysteryShopper() };
  } catch (err) {
    console.error('demo run failed', err);
    return { error: 'The demo could not run just now. Please try again.' };
  }
}
