import Contact from '@/models/Contact';
import { buildDedupeKeys } from '@/lib/normalize';

// Find an existing non-duplicate contact for this user that strongly matches
// the incoming card data. Returns the contact document or null.
//
// "Strong" means a shared exact key: same email, same mobile, same office
// phone + name/company, or same website domain + name. These are safe enough
// to merge onto rather than create a second record.
export async function findStrongDuplicate(userId, info) {
  const { dedupeKeys } = buildDedupeKeys(info);
  if (!dedupeKeys.length) return null;
  return Contact.findOne({
    userId,
    duplicateStatus: { $ne: 'merged' },
    dedupeKeys: { $in: dedupeKeys },
  }).sort({ createdAt: 1 });
}

// Merge newly extracted values into an existing contact WITHOUT overwriting
// any field that already holds a non-empty value. Returns the fields that were
// actually filled so callers can decide whether a DB write is needed.
export function mergeMissingFields(existing, info) {
  const fillable = ['name', 'title', 'company', 'phone', 'mobile', 'email', 'website', 'address'];
  const patch = {};
  for (const field of fillable) {
    const current = (existing[field] || '').trim();
    const incoming = (info[field] || '').trim();
    if (!current && incoming) patch[field] = incoming;
  }
  return patch;
}
