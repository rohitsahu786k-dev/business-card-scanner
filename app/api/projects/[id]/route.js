import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Project from '@/models/Project';
import Contact from '@/models/Contact';

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;
  await dbConnect();
  const data = await req.json();
  const project = await Project.findOneAndUpdate({ _id: id, userId: session.user.id }, data, { new: true });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(project);
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;
  await dbConnect();
  const project = await Project.findOneAndDelete({ _id: id, userId: session.user.id });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await Contact.updateMany({ projectId: id }, { projectId: null });
  return NextResponse.json({ message: 'Deleted' });
}
