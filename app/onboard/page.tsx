import { aiConfigured } from '@/lib/ai';
import { OnboardForm } from './onboard-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Open your shop to AI agents · OpenShelf' };

export default function OnboardPage() {
  return (
    <main className="page wide">
      <div className="eyebrow">For shop owners</div>
      <h1 style={{ fontSize: 40, margin: '8px 0 12px' }}>Open your shop to AI agents in about a minute.</h1>
      <p className="muted" style={{ maxWidth: 640, marginBottom: 32 }}>
        Paste your product list and write your rules the way you would say them. You check everything before it goes live, and you get paid through
        PayPal.
      </p>
      <OnboardForm aiOn={aiConfigured()} />
    </main>
  );
}
