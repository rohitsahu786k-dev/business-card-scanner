import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import { ensureDefaultProject } from '@/lib/expo';

// Returns the user's default event project, creating it once if missing.
// The scanner calls this on load so operators never pick a project manually.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await dbConnect();
    const project = await ensureDefaultProject(session.user.id);
    const contactCount = await Contact.countDocuments({ projectId: project._id, userId: session.user.id });
    return NextResponse.json({ ...project.toObject(), contactCount });
  } catch (err) {
    console.error('Default project provisioning failed:', err);
    return NextResponse.json(
      { error: 'Automation Expo 2026 could not be loaded. Please refresh or contact the administrator.' },
      { status: 500 },
    );
  }
}
