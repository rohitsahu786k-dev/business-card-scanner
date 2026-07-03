import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Contact from '@/models/Contact';
import bcrypt from 'bcryptjs';

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const admin = await User.findById(session.user.id);
  if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const data = await req.json();
  const update = {};
  if (data.name) update.name = data.name;
  if (data.email) update.email = data.email.toLowerCase();
  if (data.role) update.role = data.role;
  if (data.password) update.password = await bcrypt.hash(data.password, 12);
  const user = await User.findByIdAndUpdate(params.id, update, { new: true }).select('-password');
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const admin = await User.findById(session.user.id);
  if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  if (params.id === session.user.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
  await Contact.deleteMany({ userId: params.id });
  await User.findByIdAndDelete(params.id);
  return NextResponse.json({ message: 'User deleted' });
}
