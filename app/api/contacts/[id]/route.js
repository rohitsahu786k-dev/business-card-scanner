import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import { deleteImage } from '@/lib/cloudinary';

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await dbConnect();
  const contact = await Contact.findOne({ _id: id, userId: session.user.id });
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await dbConnect();
  const data = await req.json();
  const contact = await Contact.findOneAndUpdate({ _id: id, userId: session.user.id }, data, { new: true });
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(contact);
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await dbConnect();
  const contact = await Contact.findOneAndDelete({ _id: id, userId: session.user.id });
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (contact.cardImagePublicId) await deleteImage(contact.cardImagePublicId);
  return NextResponse.json({ message: 'Deleted' });
}
