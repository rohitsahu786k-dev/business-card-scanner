import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Media from '@/models/Media';
import Contact from '@/models/Contact';
import { uploadImage, deleteImage } from '@/lib/cloudinary';

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  const { title, base64Data, contactId } = await req.json();

  await dbConnect();
  const media = await Media.findOne({ _id: id, userId: session.user.id });
  if (!media) return NextResponse.json({ error: 'Media file not found' }, { status: 404 });

  try {
    const updateData = {};
    if (title) updateData.title = title;
    
    // If contact ID link is changing/updating
    if (contactId !== undefined) {
      updateData.contactId = contactId || null;
    }

    if (base64Data) {
      // Delete previous image from Cloudinary
      if (media.publicId) {
        await deleteImage(media.publicId);
      }

      // Upload replacement image
      const uploadResult = await uploadImage(base64Data, 'media');
      updateData.url = uploadResult.url;
      updateData.publicId = uploadResult.publicId;

      // Update size and type
      const sizeInKb = Math.round((base64Data.length * 0.75) / 1024);
      updateData.fileSize = `${sizeInKb} KB`;

      let fileType = 'image';
      const typeMatch = base64Data.match(/^data:([^;]+);base64,/);
      if (typeMatch) {
        fileType = typeMatch[1];
      }
      updateData.fileType = fileType;

      // Update linked contact's card image if it exists
      const targetContactId = contactId || media.contactId;
      if (targetContactId) {
        await Contact.findByIdAndUpdate(targetContactId, {
          cardImage: uploadResult.url,
          cardImagePublicId: uploadResult.publicId,
        });
      }
    } else if (contactId && media.url) {
      // If we linked a contact without changing the image, update the contact's image info
      await Contact.findByIdAndUpdate(contactId, {
        cardImage: media.url,
        cardImagePublicId: media.publicId,
      });
    }

    const updatedMedia = await Media.findByIdAndUpdate(id, updateData, { new: true });
    return NextResponse.json(updatedMedia);
  } catch (error) {
    console.error('Failed to update media file:', error);
    return NextResponse.json({ error: 'Failed to update media file' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  await dbConnect();

  const media = await Media.findOne({ _id: id, userId: session.user.id });
  if (!media) return NextResponse.json({ error: 'Media file not found' }, { status: 404 });

  try {
    // Delete image from Cloudinary
    if (media.publicId) {
      await deleteImage(media.publicId);
    }

    // Clean up linked contact's cardImage fields
    if (media.contactId) {
      await Contact.findByIdAndUpdate(media.contactId, {
        cardImage: '',
        cardImagePublicId: '',
      });
    }

    await Media.findByIdAndDelete(id);
    return NextResponse.json({ message: 'Media file deleted successfully' });
  } catch (error) {
    console.error('Failed to delete media file:', error);
    return NextResponse.json({ error: 'Failed to delete media file' }, { status: 500 });
  }
}
