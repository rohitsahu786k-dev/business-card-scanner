import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req) {
  try {
    const { name, email, password } = await req.json();
    if (!name || !email || !password) return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    await dbConnect();
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    const hashed = await bcrypt.hash(password, 12);
    const userCount = await User.countDocuments();
    await User.create({ name, email: email.toLowerCase(), password: hashed, role: userCount === 0 ? 'admin' : 'user' });
    return NextResponse.json({ message: 'Account created successfully' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
