'use client';

import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked. The address stays visible to copy by hand.
    }
  };
  return (
    <button type="button" className="btn" onClick={() => void copy()} aria-live="polite">
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
