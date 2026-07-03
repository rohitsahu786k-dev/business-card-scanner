import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { uploadImage, deleteImage } from '@/lib/cloudinary';

export async function PUT(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const data = await req.json();
  const user = await User.findById(session.user.id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (data.name) user.name = data.name;
  if (data.email) user.email = data.email.toLowerCase();
  if (data.avatar) {
    if (user.avatarPublicId) await deleteImage(user.avatarPublicId);
    const { url, publicId } = await uploadImage(data.avatar, 'cardscan/avatars');
    user.avatar = url;
    user.avatarPublicId = publicId;
  }
  if (data.currentPassword && data.newPassword) {
    const isValid = await bcrypt.compare(data.currentPassword, user.password);
    if (!isValid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    user.password = await bcrypt.hash(data.newPassword, 12);
  }
  await user.save();
  return NextResponse.json({ name: user.name, email: user.email, avatar: user.avatar });
}
