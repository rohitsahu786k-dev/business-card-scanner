import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import Media from '@/models/Media';
import { uploadImage } from '@/lib/cloudinary';

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
    const { image, qr, projectId, autoSave, notes } = await req.json();
    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    await dbConnect();

    // Store the card image in Cloudinary (media storage) first
    const { url, publicId } = await uploadImage(image, 'cardscan/cards');

    // QR path: client already decoded the QR — deterministic, zero AI cost.
    // AI path: extract from the uploaded image with structured output.
    let info;
    let costUsd = 0;
    let method;
    if (qr && typeof qr === 'object') {
      info = {
        name: qr.name || '', title: qr.title || '', company: qr.company || '',
        phone: qr.phone || '', mobile: qr.mobile || '', email: qr.email || '',
        website: qr.website || '', address: qr.address || '',
      };
      method = 'qr';
      if (qr.notes) info.qrNotes = qr.notes;
    } else {
      const result = await extractWithAI(url);
      info = result.info;
      costUsd = result.costUsd;
      method = 'ai';
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

    // Auto-save: persist Contact + linked Media record in one shot
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
      scanMethod: method,
      scanCost: costUsd,
    });

    const sizeInKb = Math.round((image.length * 0.75) / 1024);
    const media = await Media.create({
      userId: session.user.id,
      title: `${contact.name}${contact.company ? ' — ' + contact.company : ''}`,
      url,
      publicId,
      fileSize: `${sizeInKb} KB`,
      fileType: 'image/jpeg',
      contactId: contact._id,
    });

    return NextResponse.json({ saved: true, contact, mediaId: media._id, costUsd, method }, { status: 201 });
  } catch (err) {
    console.error('Scan failed:', err);
    return NextResponse.json({ error: err.message || 'Scan failed' }, { status: 500 });
  }
}
