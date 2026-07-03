import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { sendResetEmail } from '@/lib/email';

export async function POST(req) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    await dbConnect();
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return NextResponse.json({ message: 'If an account exists, a reset link has been sent' });
    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetExpiry = new Date(Date.now() + 3600000);
    await user.save();
    await sendResetEmail(user.email, token);
    return NextResponse.json({ message: 'If an account exists, a reset link has been sent' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
