import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import Media from '@/models/Media';
import { deleteImage } from '@/lib/cloudinary';

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await dbConnect();
    const contact = await Contact.findOne({ _id: id, userId: session.user.id });
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    return NextResponse.json(contact);
  } catch (error) {
    console.error('Contact GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await dbConnect();
    const data = await req.json();

    // Prevent updating immutable _id field
    const { _id, ...updateData } = data;

    const contact = await Contact.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { new: true }
    );

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    return NextResponse.json(contact);
  } catch (error) {
    console.error('Contact PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await dbConnect();
    const contact = await Contact.findOneAndDelete({ _id: id, userId: session.user.id });
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    await Media.deleteMany({ contactId: contact._id, userId: session.user.id });
    if (contact.cardImagePublicId) {
      await deleteImage(contact.cardImagePublicId).catch(error => {
        console.error('Contact image cleanup failed:', error);
      });
    }
    return NextResponse.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Contact DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
