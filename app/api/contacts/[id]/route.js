import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import Media from '@/models/Media';
import Project from '@/models/Project';
import { deleteImage } from '@/lib/cloudinary';
import { buildDedupeKeys } from '@/lib/normalize';

const STRING_FIELDS = ['name', 'title', 'company', 'phone', 'mobile', 'email', 'website', 'address', 'notes'];

// Editing any of these changes who the contact *is*, so the dedupe index has to
// be rebuilt — otherwise a corrected email would still match the old one.
const IDENTITY_FIELDS = ['name', 'company', 'phone', 'mobile', 'email', 'website'];

const invalidIdResponse = () => NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return invalidIdResponse();
    await dbConnect();
    const contact = await Contact.findOne({ _id: id, userId: session.user.id });
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    return NextResponse.json(contact);
  } catch (error) {
    console.error('Contact GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return invalidIdResponse();
    await dbConnect();
    const data = await req.json();

    const updateData = {};
    STRING_FIELDS.forEach((field) => {
      if (Object.hasOwn(data, field)) updateData[field] = String(data[field] || '').trim();
    });
    if (Object.hasOwn(data, 'favorite')) updateData.favorite = Boolean(data.favorite);
    if (Object.hasOwn(data, 'projectId')) {
      if (data.projectId) {
        if (!mongoose.isValidObjectId(data.projectId)) {
          return NextResponse.json({ error: 'Invalid project / exhibition' }, { status: 400 });
        }
        const project = await Project.exists({ _id: data.projectId, userId: session.user.id });
        if (!project) return NextResponse.json({ error: 'Project / exhibition not found' }, { status: 404 });
        updateData.projectId = data.projectId;
      } else {
        updateData.projectId = null;
      }
    }

    if (Object.hasOwn(updateData, 'name') && !updateData.name) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
    }
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No editable contact fields supplied' }, { status: 400 });
    }

    const existing = await Contact.findOne({ _id: id, userId: session.user.id });
    if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    if (IDENTITY_FIELDS.some(field => Object.hasOwn(updateData, field))) {
      const merged = { ...existing.toObject(), ...updateData };
      Object.assign(updateData, buildDedupeKeys(merged));
      if (Object.hasOwn(updateData, 'title')) updateData.designationRaw = updateData.title;
    }

    const contact = await Contact.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { returnDocument: 'after', runValidators: true }
    );

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    return NextResponse.json(contact);
  } catch (error) {
    console.error('Contact PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return invalidIdResponse();
    await dbConnect();
    const contact = await Contact.findOneAndDelete({ _id: id, userId: session.user.id });
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    await Media.deleteMany({ contactId: contact._id, userId: session.user.id });

    // Every side of the card is stored in Cloudinary, so all of them have to go —
    // deleting only the legacy `cardImagePublicId` orphaned every back image.
    const publicIds = new Set(
      [contact.cardImagePublicId, ...(contact.cardImages || []).map(img => img.publicId)].filter(Boolean),
    );
    await Promise.all(
      Array.from(publicIds).map(publicId => deleteImage(publicId).catch((error) => {
        console.error('Contact image cleanup failed:', error);
      })),
    );
    return NextResponse.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Contact DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
