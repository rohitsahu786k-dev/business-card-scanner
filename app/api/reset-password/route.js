import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) return NextResponse.json({ error: 'Token and password required' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    await dbConnect();
    const user = await User.findOne({ resetToken: token, resetExpiry: { $gt: new Date() } });
    if (!user) return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    user.password = await bcrypt.hash(password, 12);
    user.resetToken = null;
    user.resetExpiry = null;
    await user.save();
    return NextResponse.json({ message: 'Password reset successfully' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
