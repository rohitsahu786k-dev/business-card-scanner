import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import Project from '@/models/Project';

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'csv';
  const projectId = searchParams.get('projectId');
  const filter = { userId: session.user.id };
  let selectedProject = null;
  if (projectId) {
    if (!mongoose.isValidObjectId(projectId)) {
      return NextResponse.json({ error: 'Invalid project / exhibition ID' }, { status: 400 });
    }
    selectedProject = await Project.findOne({ _id: projectId, userId: session.user.id }).lean();
    if (!selectedProject) return NextResponse.json({ error: 'Project / exhibition not found' }, { status: 404 });
    filter.projectId = projectId;
  }
  const contacts = await Contact.find(filter)
    .populate('projectId', 'name type eventDate location')
    .sort({ createdAt: -1 })
    .lean();

  if (format === 'csv') {
    const csvCell = (value) => {
      let safe = String(value ?? '');
      if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const headers = [
      'Contact ID', 'Name', 'Job Title', 'Company', 'Phone', 'Mobile', 'Email',
      'Website', 'Address', 'Notes', 'Project / Exhibition', 'Destination Type',
      'Event Date', 'Location', 'Favorite', 'Scan Method', 'Scan Cost (USD)',
      'Captured At', 'Card Image URL',
    ];
    const rows = contacts.map(c => [
      c._id, c.name, c.title, c.company, c.phone, c.mobile, c.email, c.website,
      c.address, c.notes, c.projectId?.name || '', c.projectId?.type || '',
      c.projectId?.eventDate ? new Date(c.projectId.eventDate).toISOString().slice(0, 10) : '',
      c.projectId?.location || '', c.favorite ? 'Yes' : 'No', c.scanMethod,
      c.scanCost || 0, c.createdAt ? new Date(c.createdAt).toISOString() : '', c.cardImage,
    ].map(csvCell).join(','));
    const date = new Date().toISOString().slice(0, 10);
    const exportName = (selectedProject?.name || 'all-contacts')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'contacts';
    return new NextResponse(`\uFEFF${headers.map(csvCell).join(',')}\r\n${rows.join('\r\n')}`, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${exportName}-${date}.csv"` },
    });
  }
  if (format === 'vcf') {
    const vcards = contacts.map(c => [
      'BEGIN:VCARD','VERSION:3.0',`FN:${c.name||''}`,`TITLE:${c.title||''}`,`ORG:${c.company||''}`,
      c.phone?`TEL;TYPE=WORK:${c.phone}`:'',c.mobile?`TEL;TYPE=CELL:${c.mobile}`:'',
      c.email?`EMAIL:${c.email}`:'',c.website?`URL:${c.website}`:'',
      c.address?`ADR;TYPE=WORK:;;${c.address}`:'',c.notes?`NOTE:${c.notes}`:'','END:VCARD'
    ].filter(Boolean).join('\n')).join('\n');
    return new NextResponse(vcards, {
      headers: { 'Content-Type': 'text/vcard', 'Content-Disposition': 'attachment; filename=contacts.vcf' },
    });
  }
  return NextResponse.json(contacts, {
    headers: { 'Content-Disposition': 'attachment; filename=contacts.json' },
  });
}
