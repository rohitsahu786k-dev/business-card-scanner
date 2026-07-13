import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import Media from '@/models/Media';
import Project from '@/models/Project';
import { deleteImage, uploadImage } from '@/lib/cloudinary';
import { buildDedupeKeys } from '@/lib/normalize';
import { findStrongDuplicate, mergeMissingFields } from '@/lib/dedupe';

// Cloudinary upload + AI vision together can exceed Vercel's default function
// timeout, which surfaced as scans that never saved. Allow up to 60s.
export const maxDuration = 60;

// gpt-4o-mini pricing (USD per 1M tokens)
const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.60;

const CONTACT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Full name of the person' },
    title: { type: 'string', description: 'Job title / designation' },
    company: { type: 'string', description: 'Company or organization name' },
    phone: { type: 'string', description: 'Landline/office phone with country code if visible' },
    mobile: { type: 'string', description: 'Mobile/cell number with country code if visible' },
    email: { type: 'string', description: 'Email address' },
    website: { type: 'string', description: 'Website URL' },
    address: { type: 'string', description: 'Full postal address on one line' },
  },
  required: ['name', 'title', 'company', 'phone', 'mobile', 'email', 'website', 'address'],
  additionalProperties: false,
};

async function extractWithAI(imageUrl) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a precise business card OCR engine. Extract fields exactly as printed on the card — do not guess, invent, or reformat data. Use empty string for any field not present. Include country codes on phone numbers only when printed. Distinguish mobile/cell numbers from office/landline numbers using labels (M:, Mob, Cell vs T:, Tel, Off) when available.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the contact information from this business card image.' },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'business_card', strict: true, schema: CONTACT_SCHEMA },
      },
      max_tokens: 400,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `AI extraction failed (${response.status})`);
  }

  const data = await response.json();
  const info = JSON.parse(data.choices[0].message.content);
  const usage = data.usage || {};
  const costUsd =
    ((usage.prompt_tokens || 0) * INPUT_COST_PER_M + (usage.completion_tokens || 0) * OUTPUT_COST_PER_M) / 1e6;

  return { info, costUsd, usage };
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { image, qr, projectId, autoSave, notes, requestId, side } = await req.json();
    const cardSide = side === 'back' ? 'back' : 'front';
    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'A valid card image is required' }, { status: 400 });
    }
    if (image.length > 12_000_000) {
      return NextResponse.json({ error: 'The card image is too large' }, { status: 413 });
    }
    if (requestId && (typeof requestId !== 'string' || requestId.length > 120)) {
      return NextResponse.json({ error: 'Invalid scan request ID' }, { status: 400 });
    }

    await dbConnect();

    if (requestId) {
      const existing = await Contact.findOne({ userId: session.user.id, scanRequestId: requestId });
      if (existing) {
        return NextResponse.json({
          saved: true,
          duplicate: true,
          contact: existing,
          costUsd: existing.scanCost || 0,
          method: existing.scanMethod,
        });
      }
    }

    if (projectId) {
      if (typeof projectId !== 'string' || !mongoose.isValidObjectId(projectId)) {
        return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
      }
      const ownsProject = await Project.exists({ _id: projectId, userId: session.user.id });
      if (!ownsProject) return NextResponse.json({ error: 'Selected project was not found' }, { status: 404 });
    }

    // QR path: client already decoded the QR — deterministic, zero AI cost.
    // AI path: extract from the base64 image directly while the Cloudinary
    // upload runs in parallel — sequential upload-then-AI (with OpenAI
    // re-downloading the Cloudinary URL) made every scan several seconds slower.
    const uploadPromise = uploadImage(image, 'cardscan/cards');
    let info;
    let costUsd = 0;
    let method;
    let url;
    let publicId;
    if (qr && typeof qr === 'object') {
      info = {
        name: qr.name || '', title: qr.title || '', company: qr.company || '',
        phone: qr.phone || '', mobile: qr.mobile || '', email: qr.email || '',
        website: qr.website || '', address: qr.address || '',
      };
      method = 'qr';
      if (qr.notes) info.qrNotes = qr.notes;
      ({ url, publicId } = await uploadPromise);
    } else {
      const [uploadResult, aiResult] = await Promise.allSettled([uploadPromise, extractWithAI(image)]);
      if (uploadResult.status === 'rejected') throw uploadResult.reason;
      ({ url, publicId } = uploadResult.value);
      if (aiResult.status === 'rejected') {
        await deleteImage(publicId).catch(() => undefined);
        throw aiResult.reason;
      }
      info = aiResult.value.info;
      costUsd = aiResult.value.costUsd;
      method = 'ai';
    }

    const hasDirectContact = Boolean(info.email || info.phone || info.mobile || info.website);
    const hasIdentityContext = Boolean((info.name && (info.title || info.company || info.address)) || (info.company && info.address));
    if (!hasDirectContact && !hasIdentityContext) {
      await deleteImage(publicId).catch(() => undefined);
      return NextResponse.json(
        { error: 'No readable contact information was found. Hold the card steady and try again.' },
        { status: 422 },
      );
    }

    costUsd = Math.round(costUsd * 1e6) / 1e6;

    if (!autoSave) {
      return NextResponse.json({
        ...info,
        cardImage: url,
        cardImagePublicId: publicId,
        costUsd,
        method,
        saved: false,
      });
    }

    const sizeInKb = Math.round((image.length * 0.75) / 1024);
    const cardImageEntry = { side: cardSide, url, publicId, scanMethod: method, capturedAt: new Date() };

    // Server-side duplicate prevention (Section 6). If this card strongly
    // matches an existing contact (same email / mobile / phone+name), we link
    // the new image and fill blanks instead of creating a second record.
    const dupe = await findStrongDuplicate(session.user.id, info);
    if (dupe) {
      const patch = { ...mergeMissingFields(dupe, info) };
      if (Object.keys(patch).length) Object.assign(patch, buildDedupeKeys({ ...dupe.toObject(), ...patch }));

      const alreadyHasSide = (dupe.cardImages || []).some(img => img.side === cardSide);
      const update = {
        $set: { ...patch, lastSeenAt: new Date() },
        $inc: { scanCount: 1 },
      };
      if (projectId) update.$addToSet = { seenAtProjects: projectId };
      if (!alreadyHasSide || !dupe.cardImages?.length) {
        update.$push = { ...(update.$push || {}), cardImages: cardImageEntry };
      }
      const updated = await Contact.findByIdAndUpdate(dupe._id, update, { new: true });

      await Media.create({
        userId: session.user.id,
        title: `${updated.name}${updated.company ? ' — ' + updated.company : ''}`,
        url, publicId, fileSize: `${sizeInKb} KB`, fileType: 'image/jpeg',
        contactId: updated._id, projectId: projectId || null, side: cardSide,
        scanMethod: method, duplicateStatus: 'merged',
      }).catch(() => undefined);

      return NextResponse.json({
        saved: true,
        duplicate: true,
        contact: updated,
        linkedImage: !alreadyHasSide,
        message: 'This contact already exists. No duplicate was created.',
        method,
      });
    }

    // Auto-save: persist Contact + linked Media record in one shot
    const dedupe = buildDedupeKeys(info);
    const contact = await Contact.create({
      userId: session.user.id,
      projectId: projectId || null,
      name: info.name || 'Unnamed Contact',
      title: info.title || '',
      company: info.company || '',
      phone: info.phone || '',
      mobile: info.mobile || '',
      email: info.email || '',
      website: info.website || '',
      address: info.address || '',
      notes: notes || info.qrNotes || (method === 'qr' ? 'Scanned via QR code' : 'Scanned via AI'),
      cardImage: url,
      cardImagePublicId: publicId,
      cardImages: [cardImageEntry],
      designationRaw: info.title || '',
      scanMethod: method,
      scanCost: costUsd,
      scanRequestId: requestId || null,
      seenAtProjects: projectId ? [projectId] : [],
      enrichmentStatus: 'pending',
      ...dedupe,
    });

    let media;
    try {
      media = await Media.create({
        userId: session.user.id,
        title: `${contact.name}${contact.company ? ' — ' + contact.company : ''}`,
        url,
        publicId,
        fileSize: `${sizeInKb} KB`,
        fileType: 'image/jpeg',
        contactId: contact._id,
        projectId: projectId || null,
        side: cardSide,
        scanMethod: method,
        duplicateStatus: 'unique',
      });
    } catch (error) {
      await Contact.deleteOne({ _id: contact._id });
      await deleteImage(publicId).catch(() => undefined);
      throw error;
    }

    return NextResponse.json({ saved: true, contact, mediaId: media._id, costUsd, method }, { status: 201 });
  } catch (err) {
    console.error('Scan failed:', err);
    return NextResponse.json({ error: err.message || 'Scan failed' }, { status: 500 });
  }
}
