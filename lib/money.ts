/** All money in OpenShelf is stored as integer cents (USD only). */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** PayPal wants decimal strings such as "18.00". */
export function centsToPayPal(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function payPalToCents(value: string): number {
  return Math.round(parseFloat(value) * 100);
}
