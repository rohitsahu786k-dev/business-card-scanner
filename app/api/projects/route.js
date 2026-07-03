import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Project from '@/models/Project';
import Contact from '@/models/Contact';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const projects = await Project.find({ userId: session.user.id }).sort({ createdAt: -1 }).lean();
  const withCounts = await Promise.all(projects.map(async (p) => {
    const count = await Contact.countDocuments({ projectId: p._id });
    return { ...p, contactCount: count };
  }));
  return NextResponse.json(withCounts);
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const data = await req.json();
  if (!data.name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  const project = await Project.create({ ...data, userId: session.user.id });
  return NextResponse.json(project, { status: 201 });
}
