import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';

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
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const data = await req.json();
  const contact = await Contact.create({ ...data, userId: session.user.id });
  return NextResponse.json(contact, { status: 201 });
}
