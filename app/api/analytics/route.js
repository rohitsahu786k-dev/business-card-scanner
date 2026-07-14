import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Contact from '@/models/Contact';
import Project from '@/models/Project';
import { resolveCoordinates, resolveCountry } from '@/lib/geo';

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
          departments: [
            { $match: { department: { $nin: ['', null] } } },
            { $group: { _id: '$department', count: { $sum: 1 } } },
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
            // Country alone is enough to place a contact on the world map, even
            // when the card printed no city or state.
            {
              $match: {
                $or: [
                  { city: { $nin: ['', null] } },
                  { state: { $nin: ['', null] } },
                  { country: { $nin: ['', null] } },
                ],
              },
            },
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

    // Resolve each city/state grouping to coordinates (offline), then merge any
    // that collapse onto the same point — e.g. two contacts whose city is unknown
    // but whose state is the same both land on that state's centroid.
    const merged = new Map();
    for (const p of facet.mapPoints) {
      const coords = resolveCoordinates(p._id.city, p._id.state, p._id.country);
      if (!coords) continue;
      const key = `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;
      const label = coords.level === 'city' && p._id.city
        ? p._id.city
        : (p._id.state || p._id.city || 'India');

      let entry = merged.get(key);
      if (!entry) {
        entry = {
          label,
          lat: coords.lat,
          lng: coords.lng,
          level: coords.level,
          count: 0,
          decisionMakers: 0,
          companySet: new Set(),
        };
        merged.set(key, entry);
      }
      entry.count += p.count;
      entry.decisionMakers += p.decisionMakers;
      p.companies.forEach((c) => { if (c) entry.companySet.add(c.toLowerCase()); });
    }

    const mapData = Array.from(merged.values())
      .map(({ companySet, ...rest }) => ({ ...rest, companies: companySet.size }))
      .sort((a, b) => b.count - a.count);

    // The same contacts rolled up to countries, for the world view. Contacts that
    // fall outside India never appear on the India map, so without this they were
    // simply invisible.
    const byCountry = new Map();
    for (const p of facet.mapPoints) {
      const place = resolveCountry(p._id.city, p._id.state, p._id.country);
      if (!place) continue;
      let entry = byCountry.get(place.country);
      if (!entry) {
        entry = { label: place.country, lat: place.lat, lng: place.lng, count: 0, decisionMakers: 0, companySet: new Set() };
        byCountry.set(place.country, entry);
      }
      entry.count += p.count;
      entry.decisionMakers += p.decisionMakers;
      p.companies.forEach((c) => { if (c) entry.companySet.add(c.toLowerCase()); });
    }
    const worldData = Array.from(byCountry.values())
      .map(({ companySet, ...rest }) => ({ ...rest, companies: companySet.size }))
      .sort((a, b) => b.count - a.count);
    const outsideIndia = worldData
      .filter(c => c.label !== 'India')
      .reduce((sum, c) => sum + c.count, 0);

    // The aggregation only emits days that had captures. Fill the gaps so the
    // timeline is a real time axis (a quiet day reads as zero, not as absent).
    //
    // Buckets are UTC calendar days ($dateToString), so this walks UTC days and
    // compares by day key rather than by instant. Comparing instants would drop
    // the current day whenever the caller's startDate carries a local-midnight
    // offset (e.g. a 7-day range from an IST browser starts at 18:30Z).
    const densifyTimeline = (buckets) => {
      if (!buckets.length) return [];
      const counts = new Map(buckets.map(b => [b._id, b.count]));
      const from = startDate ? new Date(startDate) : new Date(`${buckets[0]._id}T00:00:00Z`);
      const lastKey = (endDate ? new Date(endDate) : new Date()).toISOString().slice(0, 10);
      const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));

      const out = [];
      while (out.length < 400) {
        const key = day.toISOString().slice(0, 10);
        out.push({ date: key, value: counts.get(key) || 0 });
        if (key >= lastKey) break;
        day.setUTCDate(day.getUTCDate() + 1);
      }
      return out;
    };

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
      departments: facet.departments.map(d => ({ label: d._id, value: d.count })),
      states: facet.states.map(s => ({ label: s._id, value: s.count })),
      cities: facet.cities.map(c => ({ label: c._id, value: c.count })),
      map: mapData,
      world: worldData,
      outsideIndia,
      timeline: densifyTimeline(facet.timeline),
      enrichmentReady: kpis.industriesCovered > 0 || kpis.decisionMakers > 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Analytics failed:', err);
    return NextResponse.json({ error: 'Could not load analytics' }, { status: 500 });
  }
}
