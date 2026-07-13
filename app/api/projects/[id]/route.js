import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Project from '@/models/Project';
import Contact from '@/models/Contact';

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();
    const data = await req.json();

    if (!data.name?.trim()) {
      return NextResponse.json({ error: 'Project / exhibition name is required' }, { status: 400 });
    }
    if (data.type && !['project', 'exhibition'].includes(data.type)) {
      return NextResponse.json({ error: 'Invalid destination type' }, { status: 400 });
    }
    const updateData = {
      name: data.name.trim(),
      type: data.type || 'project',
      description: data.description || '',
      eventDate: data.eventDate || null,
      location: data.location || '',
    };

    const project = await Project.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { new: true }
    );

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json(project);
  } catch (error) {
    console.error('Project PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const project = await Project.findOneAndDelete({ _id: id, userId: session.user.id });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Set contacts in this project to unorganized (projectId: null)
    await Contact.updateMany({ projectId: id, userId: session.user.id }, { projectId: null });

    return NextResponse.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Project DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
