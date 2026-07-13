import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import Project from '@/models/Project';

const STRING_FIELDS = ['name', 'title', 'company', 'phone', 'mobile', 'email', 'website', 'address', 'notes'];

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const projectId = searchParams.get('projectId');
  const favorite = searchParams.get('favorite');
  const filter = { userId: session.user.id };
  if (projectId) filter.projectId = projectId;
  if (favorite === 'true') filter.favorite = true;
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } }, { company: { $regex: q, $options: 'i' } },
    { email: { $regex: q, $options: 'i' } }, { phone: { $regex: q, $options: 'i' } },
  ];
  const contacts = await Contact.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json(contacts);
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const data = await req.json();
    if (!data.name?.trim()) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
    }

    let projectId = null;
    if (data.projectId) {
      if (!mongoose.isValidObjectId(data.projectId)) {
        return NextResponse.json({ error: 'Invalid project / exhibition' }, { status: 400 });
      }
      const project = await Project.exists({ _id: data.projectId, userId: session.user.id });
      if (!project) return NextResponse.json({ error: 'Project / exhibition not found' }, { status: 404 });
      projectId = data.projectId;
    }

    const contactData = { userId: session.user.id, projectId };
    STRING_FIELDS.forEach((field) => { contactData[field] = String(data[field] || '').trim(); });
    contactData.favorite = Boolean(data.favorite);
    contactData.scanMethod = ['manual', 'import'].includes(data.scanMethod) ? data.scanMethod : 'manual';

    const contact = await Contact.create(contactData);
    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error('Contact POST error:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}
