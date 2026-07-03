import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Media from '@/models/Media';
import Contact from '@/models/Contact';
import { uploadImage } from '@/lib/cloudinary';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await dbConnect();
  const mediaItems = await Media.find({ userId: session.user.id })
    .populate('contactId', 'name email company')
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json(mediaItems);
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, base64Data, contactId } = await req.json();
  if (!title || !base64Data) {
    return NextResponse.json({ error: 'Title and image file are required' }, { status: 400 });
  }

  await dbConnect();

  try {
    // Upload image to Cloudinary
    const uploadResult = await uploadImage(base64Data, 'media');

    // Approximate base64 string size to KB (base64 string size * 0.75 / 1024)
    const sizeInKb = Math.round((base64Data.length * 0.75) / 1024);
    const fileSize = `${sizeInKb} KB`;

    // Extract file format from base64 header if possible (e.g. data:image/png;base64)
    let fileType = 'image';
    const typeMatch = base64Data.match(/^data:([^;]+);base64,/);
    if (typeMatch) {
      fileType = typeMatch[1];
    }

    const newMedia = await Media.create({
      userId: session.user.id,
      title,
      url: uploadResult.url,
      publicId: uploadResult.publicId,
      fileSize,
      fileType,
      contactId: contactId || null,
    });

    // If contactId is provided, update that contact's card image
    if (contactId) {
      await Contact.findByIdAndUpdate(contactId, {
        cardImage: uploadResult.url,
        cardImagePublicId: uploadResult.publicId,
      });
    }

    return NextResponse.json(newMedia);
  } catch (error) {
    console.error('Failed to create media file:', error);
    return NextResponse.json({ error: 'Failed to process media file upload' }, { status: 500 });
  }
}
