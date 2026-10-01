const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Formats an amount held in paise for display, for example 500000 -> "₹5,000". */
export function formatInr(paise: number): string {
  return INR.format(paise / 100);
}
