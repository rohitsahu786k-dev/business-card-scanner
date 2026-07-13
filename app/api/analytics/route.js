import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import Project from '@/models/Project';
import { resolveCoordinates } from '@/lib/geo';

export const dynamic = 'force-dynamic';

const SENIOR_LEVELS = ['Owner', 'C-Level', 'Director', 'VP', 'Head', 'GM'];

// Server-side analytics over a user's contacts (optionally one project). Uses a
// single $facet aggregation so the browser never downloads raw contacts.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await dbConnect();
    const userId = new mongoose.Types.ObjectId(session.user.id);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const match = { userId };
    if (projectId && mongoose.isValidObjectId(projectId)) {
      match.projectId = new mongoose.Types.ObjectId(projectId);
    }
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    // A contact "has field" helper as an aggregation expression.
    const nonEmpty = (field) => ({ $gt: [{ $strLenCP: { $ifNull: [`$${field}`, ''] } }, 0] });

    const [facet] = await Contact.aggregate([
      { $match: match },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalContacts: { $sum: 1 },
                withEmail: { $sum: { $cond: [nonEmpty('email'), 1, 0] } },
                withMobile: { $sum: { $cond: [{ $or: [nonEmpty('mobile'), nonEmpty('phone')] }, 1, 0] } },
                withCompany: { $sum: { $cond: [nonEmpty('company'), 1, 0] } },
                withTitle: { $sum: { $cond: [nonEmpty('title'), 1, 0] } },
                withAddress: { $sum: { $cond: [nonEmpty('address'), 1, 0] } },
                withIndustry: { $sum: { $cond: [nonEmpty('industry'), 1, 0] } },
                aiScans: { $sum: { $cond: [{ $eq: ['$scanMethod', 'ai'] }, 1, 0] } },
                qrScans: { $sum: { $cond: [{ $eq: ['$scanMethod', 'qr'] }, 1, 0] } },
                manualScans: { $sum: { $cond: [{ $eq: ['$scanMethod', 'manual'] }, 1, 0] } },
                importScans: { $sum: { $cond: [{ $eq: ['$scanMethod', 'import'] }, 1, 0] } },
                totalCost: { $sum: { $ifNull: ['$scanCost', 0] } },
                favorites: { $sum: { $cond: ['$favorite', 1, 0] } },
                duplicatesPrevented: { $sum: { $max: [{ $subtract: [{ $ifNull: ['$scanCount', 1] }, 1] }, 0] } },
                frontAndBack: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $in: ['front', { $ifNull: ['$cardImages.side', []] }] },
                          { $in: ['back', { $ifNull: ['$cardImages.side', []] }] },
                        ],
                      }, 1, 0,
                    ],
                  },
                },
                decisionMakers: { $sum: { $cond: [{ $in: ['$seniorityLevel', SENIOR_LEVELS] }, 1, 0] } },
                highPriorityLeads: { $sum: { $cond: [{ $eq: ['$leadPriority', 'High'] }, 1, 0] } },
                pendingEnrichment: { $sum: { $cond: [{ $in: ['$enrichmentStatus', ['pending', 'processing', 'failed']] }, 1, 0] } },
              },
            },
          ],
          companies: [
            { $match: { company: { $nin: ['', null] } } },
            { $group: { _id: { $toLower: '$company' }, name: { $first: '$company' }, count: { $sum: 1 } } },
            { $sort: { count: -1, name: 1 } },
            { $limit: 10 },
          ],
          uniqueCompanies: [
            { $match: { company: { $nin: ['', null] } } },
            { $group: { _id: { $toLower: '$company' } } },
            { $count: 'n' },
          ],
          industries: [
            { $match: { industry: { $nin: ['', null] } } },
            { $group: { _id: '$industry', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          seniority: [
            { $match: { seniorityLevel: { $nin: ['', null] } } },
            { $group: { _id: '$seniorityLevel', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          designations: [
            { $match: { designationCategory: { $nin: ['', null] } } },
            { $group: { _id: '$designationCategory', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          states: [
            { $match: { state: { $nin: ['', null] } } },
            { $group: { _id: '$state', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 8 },
          ],
          cities: [
            { $match: { city: { $nin: ['', null] } } },
            { $group: { _id: '$city', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 8 },
          ],
          mapPoints: [
            { $match: { $or: [{ city: { $nin: ['', null] } }, { state: { $nin: ['', null] } }] } },
            {
              $group: {
                _id: { city: '$city', state: '$state', country: '$country' },
                count: { $sum: 1 },
                companies: { $addToSet: '$company' },
                decisionMakers: { $sum: { $cond: [{ $in: ['$seniorityLevel', SENIOR_LEVELS] }, 1, 0] } },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 60 },
          ],
          timeline: [
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const t = facet.totals[0] || {};
    const total = t.totalContacts || 0;

    const kpis = {
      totalContacts: total,
      uniqueCompanies: facet.uniqueCompanies[0]?.n || 0,
      withEmail: t.withEmail || 0,
      withMobile: t.withMobile || 0,
      frontAndBack: t.frontAndBack || 0,
      duplicatesPrevented: t.duplicatesPrevented || 0,
      aiScans: t.aiScans || 0,
      qrScans: t.qrScans || 0,
      manualScans: t.manualScans || 0,
      importScans: t.importScans || 0,
      totalCost: Math.round((t.totalCost || 0) * 1e6) / 1e6,
      favorites: t.favorites || 0,
      industriesCovered: facet.industries.length,
      citiesCovered: facet.cities.length,
      decisionMakers: t.decisionMakers || 0,
      highPriorityLeads: t.highPriorityLeads || 0,
      pendingEnrichment: t.pendingEnrichment || 0,
      // Real field-presence completeness (independent of AI enrichment).
      dataCompleteness: total
        ? Math.round(((t.withEmail + t.withMobile + t.withCompany + t.withTitle + t.withAddress) / (total * 5)) * 100)
        : 0,
    };

    // Resolve each city/state grouping to coordinates (offline). Merge points
    // that collapse onto the same coordinate (e.g. unknown city → state centroid).
    const mapMerge = new Map();
    for (const p of facet.mapPoints) {
      const coords = resolveCoordinates(p._id.city, p._id.state, p._id.country);
      if (!coords) continue;
      const key = `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;
      const label = coords.level === 'city' && p._id.city ? p._id.city : (p._id.state || p._id.city || 'India');
      const existing = mapMerge.get(key);
      if (existing) {
        existing.count += p.count;
        existing.decisionMakers += p.decisionMakers;
        p.companies.forEach(c => { if (c) existing.companySet.add(c.toLowerCase()); });
      } else {
        const companySet = new Set();
        p.companies.forEach(c => { if (c) companySet.add(c.toLowerCase()); });
        mapMerge.set(key, { label, lat: coords.lat, lng: coords.lng, level: coords.level, count: p.count, decisionMakers: p.decisionMakers, companySet });
      }
    }
    const mapData = Array.from(mapMerge.values())
      .map(({ companySet, ...rest }) => ({ ...rest, companies: companySet.size }))
      .sort((a, b) => b.count - a.count);

    const dataQuality = {
      missingEmail: total - (t.withEmail || 0),
      missingMobile: total - (t.withMobile || 0),
      missingCompany: total - (t.withCompany || 0),
      missingDesignation: total - (t.withTitle || 0),
      missingIndustry: total - (t.withIndustry || 0),
      pendingEnrichment: t.pendingEnrichment || 0,
    };

    return NextResponse.json({
      kpis,
      dataQuality,
      scanMethods: [
        { label: 'AI', value: kpis.aiScans },
        { label: 'QR / vCard', value: kpis.qrScans },
        { label: 'Manual', value: kpis.manualScans },
        { label: 'Import', value: kpis.importScans },
      ].filter(s => s.value > 0),
      topCompanies: facet.companies.map(c => ({ label: c.name, value: c.count })),
      industries: facet.industries.map(i => ({ label: i._id, value: i.count })),
      seniority: facet.seniority.map(s => ({ label: s._id, value: s.count })),
      designations: facet.designations.map(d => ({ label: d._id, value: d.count })),
      states: facet.states.map(s => ({ label: s._id, value: s.count })),
      cities: facet.cities.map(c => ({ label: c._id, value: c.count })),
      map: mapData,
      timeline: facet.timeline.map(d => ({ date: d._id, value: d.count })),
      enrichmentReady: kpis.industriesCovered > 0 || kpis.decisionMakers > 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Analytics failed:', err);
    return NextResponse.json({ error: 'Could not load analytics' }, { status: 500 });
  }
}
