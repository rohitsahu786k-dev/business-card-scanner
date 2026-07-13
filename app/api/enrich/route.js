import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import { enrichContact, buildEnrichmentUpdate } from '@/lib/enrich';

export const maxDuration = 60;

const BATCH_LIMIT = 20;

// Enrich one contact. Marks processing -> completed/failed. Idempotent per call:
// only runs when status allows (skips 'completed'/'processing' unless forced).
async function runOne(userId, contact, force) {
  if (!force && contact.enrichmentStatus === 'completed') return 'skipped';
  await Contact.updateOne({ _id: contact._id }, { $set: { enrichmentStatus: 'processing' } });
  try {
    const { enriched, costUsd } = await enrichContact(contact);
    const update = buildEnrichmentUpdate(contact, enriched, costUsd);
    await Contact.updateOne({ _id: contact._id, userId }, { $set: update });
    return 'completed';
  } catch (err) {
    console.error('Enrich failed for', String(contact._id), err.message);
    await Contact.updateOne({ _id: contact._id }, { $set: { enrichmentStatus: 'failed' } });
    return 'failed';
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await dbConnect();
    const userId = session.user.id;
    const body = await req.json().catch(() => ({}));
    const { contactId, batch, force } = body;

    if (contactId) {
      if (!mongoose.isValidObjectId(contactId)) {
        return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
      }
      const contact = await Contact.findOne({ _id: contactId, userId });
      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      const result = await runOne(userId, contact, force);
      return NextResponse.json({ result, contactId });
    }

    if (batch) {
      // Backfill: enrich a page of pending/failed contacts for this user.
      const pending = await Contact.find({
        userId,
        enrichmentStatus: { $in: ['pending', 'failed'] },
      }).sort({ createdAt: -1 }).limit(BATCH_LIMIT);

      let completed = 0;
      let failed = 0;
      for (const contact of pending) {
        const r = await runOne(userId, contact, false);
        if (r === 'completed') completed += 1;
        else if (r === 'failed') failed += 1;
      }
      const remaining = await Contact.countDocuments({ userId, enrichmentStatus: { $in: ['pending', 'failed'] } });
      return NextResponse.json({ processed: pending.length, completed, failed, remaining });
    }

    return NextResponse.json({ error: 'Provide contactId or batch:true' }, { status: 400 });
  } catch (err) {
    console.error('Enrich route failed:', err);
    return NextResponse.json({ error: 'Enrichment request failed' }, { status: 500 });
  }
}
