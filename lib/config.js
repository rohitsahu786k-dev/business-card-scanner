// Display-only conversion for the "≈ ₹" hint shown next to AI scan cost. Scans
// are billed by OpenAI in USD — this rate never touches stored data, so an
// out-of-date value can only make the hint stale, never the accounting wrong.
// Override with NEXT_PUBLIC_USD_TO_INR (must be inlined at build time, hence the
// literal process.env reference rather than a dynamic lookup).
const configured = Number(process.env.NEXT_PUBLIC_USD_TO_INR);
export const USD_TO_INR = Number.isFinite(configured) && configured > 0 ? configured : 88;

export const formatUsd = (usd) => `$${(usd || 0).toFixed(4)}`;
export const formatInr = (usd) => `₹${((usd || 0) * USD_TO_INR).toFixed(2)}`;
