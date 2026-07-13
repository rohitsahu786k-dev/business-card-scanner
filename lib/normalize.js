// Pure normalization helpers used for server-side duplicate detection.
// No DB or network access here so the logic stays easy to reason about and test.

// Lowercase, trim, collapse whitespace. Used for names and companies.
export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Company names: drop common legal suffixes so "Acme Pvt Ltd" == "Acme".
const COMPANY_SUFFIXES = [
  'pvt', 'private', 'ltd', 'limited', 'llp', 'llc', 'inc', 'incorporated',
  'corp', 'corporation', 'co', 'company', 'gmbh', 'plc', 'sa', 'ag', 'srl',
];
export function normalizeCompany(value) {
  const words = normalizeText(value).split(' ').filter(Boolean);
  const trimmed = words.filter(w => !COMPANY_SUFFIXES.includes(w));
  return (trimmed.length ? trimmed : words).join(' ');
}

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email.includes('@')) return '';
  return email;
}

// Normalize a phone number for comparison. Keeps meaningful country codes and
// treats Indian numbers written with or without +91 / 0 prefixes as equal.
export function normalizePhone(value) {
  let digits = String(value || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  const hadPlus = digits.startsWith('+');
  digits = digits.replace(/\+/g, '');

  // Indian mobile: 10 digits, optionally prefixed with 91 or 0.
  if (!hadPlus) {
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  // A bare 10-digit number is assumed Indian and stored without country code.
  if (digits.length === 10) return digits;
  // Otherwise keep the last 10 digits as a stable comparison key when longer,
  // but also retain the full string prefix to avoid cross-country collisions.
  return digits;
}

export function websiteDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const withoutScheme = raw.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const domain = withoutScheme.split(/[/?#]/)[0];
  return domain || '';
}

// Build the full normalized field set for a contact-like object.
export function normalizeContactFields(info) {
  return {
    normalizedEmail: normalizeEmail(info.email),
    normalizedMobile: normalizePhone(info.mobile),
    normalizedPhone: normalizePhone(info.phone),
    normalizedName: normalizeText(info.name),
    normalizedCompany: normalizeCompany(info.company),
  };
}

// Deterministic keys used for exact/strong duplicate matching. A contact
// matching any of another contact's keys is treated as the same person.
export function buildDedupeKeys(info) {
  const norm = normalizeContactFields(info);
  const keys = [];
  if (norm.normalizedEmail) keys.push(`email:${norm.normalizedEmail}`);
  if (norm.normalizedMobile) keys.push(`mobile:${norm.normalizedMobile}`);
  // Office phone alone is weak, so pair it with name or company.
  if (norm.normalizedPhone && norm.normalizedName) {
    keys.push(`phone-name:${norm.normalizedPhone}:${norm.normalizedName}`);
  }
  if (norm.normalizedPhone && norm.normalizedCompany) {
    keys.push(`phone-company:${norm.normalizedPhone}:${norm.normalizedCompany}`);
  }
  const domain = websiteDomain(info.website);
  if (domain && norm.normalizedName) keys.push(`web-name:${domain}:${norm.normalizedName}`);
  return { ...norm, dedupeKeys: Array.from(new Set(keys)) };
}
