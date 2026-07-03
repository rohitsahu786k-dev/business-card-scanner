import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'csv';
  const projectId = searchParams.get('projectId');
  const filter = { userId: session.user.id };
  if (projectId) filter.projectId = projectId;
  const contacts = await Contact.find(filter).lean();

  if (format === 'csv') {
    const headers = 'Name,Title,Company,Phone,Mobile,Email,Website,Address,Notes';
    const rows = contacts.map(c =>
      [c.name,c.title,c.company,c.phone,c.mobile,c.email,c.website,c.address,c.notes]
        .map(v => `"${(v||'').replace(/"/g,'""')}"`)
        .join(',')
    );
    return new NextResponse(headers + '\n' + rows.join('\n'), {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=contacts.csv' },
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
