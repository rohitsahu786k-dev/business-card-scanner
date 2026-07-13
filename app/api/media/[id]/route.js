import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Media from '@/models/Media';
import Contact from '@/models/Contact';
import { uploadImage, deleteImage } from '@/lib/cloudinary';

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid media ID' }, { status: 400 });
  }
  const { title, base64Data, contactId } = await req.json();

  await dbConnect();
  const media = await Media.findOne({ _id: id, userId: session.user.id });
  if (!media) return NextResponse.json({ error: 'Media file not found' }, { status: 404 });

  try {
    const updateData = {};
    if (title?.trim()) updateData.title = title.trim();

    let linkedContact = null;
    if (contactId) {
      if (!mongoose.isValidObjectId(contactId)) {
        return NextResponse.json({ error: 'Invalid contact' }, { status: 400 });
      }
      linkedContact = await Contact.findOne({ _id: contactId, userId: session.user.id });
      if (!linkedContact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    
    // If contact ID link is changing/updating
    if (contactId !== undefined) {
      updateData.contactId = contactId || null;
    }

    if (base64Data) {
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
      const targetContactId = linkedContact?._id || media.contactId;
      if (targetContactId) {
        await Contact.findOneAndUpdate({ _id: targetContactId, userId: session.user.id }, {
          cardImage: uploadResult.url,
          cardImagePublicId: uploadResult.publicId,
        });
      }
    } else if (linkedContact && media.url) {
      // If we linked a contact without changing the image, update the contact's image info
      await Contact.findOneAndUpdate({ _id: linkedContact._id, userId: session.user.id }, {
        cardImage: media.url,
        cardImagePublicId: media.publicId,
      });
    }

    if (contactId !== undefined && String(media.contactId || '') !== String(contactId || '')) {
      if (media.contactId) {
        await Contact.findOneAndUpdate(
          { _id: media.contactId, userId: session.user.id, cardImagePublicId: media.publicId },
          { cardImage: '', cardImagePublicId: '' },
        );
      }
    }

    const previousPublicId = media.publicId;
    const updatedMedia = await Media.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { returnDocument: 'after', runValidators: true },
    );
    if (base64Data && previousPublicId && previousPublicId !== updatedMedia.publicId) {
      await deleteImage(previousPublicId).catch(error => console.error('Previous media cleanup failed:', error));
    }
    return NextResponse.json(updatedMedia);
  } catch (error) {
    console.error('Failed to update media file:', error);
    return NextResponse.json({ error: 'Failed to update media file' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid media ID' }, { status: 400 });
  }
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
      await Contact.findOneAndUpdate({
        _id: media.contactId,
        userId: session.user.id,
        cardImagePublicId: media.publicId,
      }, {
        cardImage: '',
        cardImagePublicId: '',
      });
    }

    await Media.deleteOne({ _id: id, userId: session.user.id });
    return NextResponse.json({ message: 'Media file deleted successfully' });
  } catch (error) {
    console.error('Failed to delete media file:', error);
    return NextResponse.json({ error: 'Failed to delete media file' }, { status: 500 });
  }
}
