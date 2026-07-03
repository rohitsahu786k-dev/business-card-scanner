import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Contact from '@/models/Contact';
import bcrypt from 'bcryptjs';
import { sendWelcomeEmail } from '@/lib/email';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const admin = await User.findById(session.user.id);
  if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const users = await User.find({}).select('-password -resetToken -resetExpiry').sort({ createdAt: -1 }).lean();
  const withStats = await Promise.all(users.map(async u => ({
    ...u, contactCount: await Contact.countDocuments({ userId: u._id })
  })));
  return NextResponse.json(withStats);
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const admin = await User.findById(session.user.id);
  if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const { name, email, password, role } = await req.json();
  if (!name || !email || !password) return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email: email.toLowerCase(), password: hashed, role: role || 'user' });
  
  // Send email to the created user with their credentials
  try {
    await sendWelcomeEmail(user.email, user.name, password);
  } catch (err) {
    console.error('Failed to send welcome email:', err);
  }

  return NextResponse.json({ _id: user._id, name: user.name, email: user.email, role: user.role }, { status: 201 });
}
