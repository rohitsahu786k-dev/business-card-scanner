// AI enrichment for a saved contact: classify industry, designation, seniority,
// department and location from the already-extracted card fields. Never invents
// data (empty string when unknown). Lead score is computed deterministically
// from the enriched output, not trusted from the model.

import { resolveCoordinates } from '@/lib/geo';

const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.60;

export const INDUSTRIES = [
  'Industrial Automation', 'Power and Utilities', 'Oil and Gas', 'Cement', 'Steel and Metals',
  'Manufacturing', 'Process Industry', 'Infrastructure', 'Railways and Transportation',
  'Airports and Aviation', 'Defence', 'Security and Surveillance', 'Data Centres',
  'IT and Networking', 'EPC', 'System Integration', 'Consulting', 'Government', 'Healthcare',
  'Education', 'Other', '',
];
export const DESIGNATION_CATEGORIES = [
  'Owner / Founder', 'CEO / CXO', 'Director', 'Vice President', 'General Manager',
  'Department Head', 'Senior Manager', 'Manager', 'Assistant Manager', 'Engineer',
  'Executive', 'Consultant', 'Other', '',
];
export const DEPARTMENTS = [
  'Projects', 'Operations', 'Maintenance', 'Automation', 'Instrumentation', 'Electrical',
  'IT / OT', 'Security', 'Procurement', 'Purchase', 'Engineering', 'Design', 'Sales',
  'Business Development', 'Administration', 'Management', 'Other', '',
];
export const SENIORITY_LEVELS = [
  'Owner', 'C-Level', 'Director', 'VP', 'Head', 'GM', 'Senior Manager', 'Manager',
  'Individual Contributor', 'Consultant', 'Unknown', '',
];

// Industries most relevant to OnePWS (control-room / automation) score higher.
const PRIORITY_INDUSTRIES = new Set([
  'Industrial Automation', 'Power and Utilities', 'Oil and Gas', 'Process Industry',
  'Infrastructure', 'Defence', 'Security and Surveillance', 'Data Centres', 'EPC',
  'System Integration', 'Railways and Transportation', 'Airports and Aviation',
]);
const SENIOR = new Set(['Owner', 'C-Level', 'Director', 'VP', 'Head', 'GM']);
const RELEVANT_DEPTS = new Set(['Projects', 'Operations', 'Automation', 'Instrumentation', 'IT / OT', 'Security', 'Engineering', 'Management']);

const ENRICH_SCHEMA = {
  type: 'object',
  properties: {
    industry: { type: 'string', enum: INDUSTRIES.filter(Boolean) },
    subIndustry: { type: 'string' },
    standardizedCompany: { type: 'string' },
    designationCategory: { type: 'string', enum: DESIGNATION_CATEGORIES.filter(Boolean) },
    department: { type: 'string', enum: DEPARTMENTS.filter(Boolean) },
    seniorityLevel: { type: 'string', enum: SENIORITY_LEVELS.filter(Boolean) },
    city: { type: 'string' },
    state: { type: 'string' },
    country: { type: 'string' },
    postalCode: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    reviewFlags: { type: 'array', items: { type: 'string' } },
    confidence: {
      type: 'object',
      properties: {
        industry: { type: 'number' }, designation: { type: 'number' },
        location: { type: 'number' }, overall: { type: 'number' },
      },
      required: ['industry', 'designation', 'location', 'overall'],
      additionalProperties: false,
    },
  },
  required: [
    'industry', 'subIndustry', 'standardizedCompany', 'designationCategory', 'department',
    'seniorityLevel', 'city', 'state', 'country', 'postalCode', 'tags', 'summary',
    'reviewFlags', 'confidence',
  ],
  additionalProperties: false,
};

// Deterministic 0-100 lead score + priority band from enriched + raw fields.
export function scoreLead(contact, e) {
  let score = 0;
  if (SENIOR.has(e.seniorityLevel)) score += 35;
  else if (['Senior Manager', 'Manager'].includes(e.seniorityLevel)) score += 20;
  else if (e.seniorityLevel && e.seniorityLevel !== 'Unknown') score += 8;
  if (PRIORITY_INDUSTRIES.has(e.industry)) score += 22;
  else if (e.industry && e.industry !== 'Other') score += 8;
  if (RELEVANT_DEPTS.has(e.department)) score += 12;
  if (contact.email) score += 10;
  if (contact.mobile || contact.phone) score += 10;
  if (contact.company) score += 6;
  if (contact.favorite) score += 5;
  if ((contact.scanCount || 1) > 1) score += 5; // repeat interaction
  score = Math.min(100, score);
  const leadPriority = score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low';
  return { leadScore: score, leadPriority };
}

// Field-presence completeness (0-100), independent of the AI call.
export function computeCompleteness(contact) {
  const fields = ['name', 'company', 'email', 'title', 'address'];
  const present = fields.filter(f => (contact[f] || '').trim()).length
    + ((contact.mobile || contact.phone) ? 1 : 0);
  return Math.round((present / (fields.length + 1)) * 100);
}

// Call the model to classify one contact. Returns { enriched, costUsd }.
export async function enrichContact(contact) {
  const profile = [
    `Name: ${contact.name || ''}`,
    `Title/Designation: ${contact.title || ''}`,
    `Company: ${contact.company || ''}`,
    `Email: ${contact.email || ''}`,
    `Website: ${contact.website || ''}`,
    `Address: ${contact.address || ''}`,
    `Notes: ${contact.notes || ''}`,
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You classify a business contact from its business-card fields. Never invent facts. Use empty string when a value cannot be reasonably inferred from the given text. Derive city/state/country/postalCode ONLY from the printed address. Standardize the company name (expand/keep suffixes consistently) without changing its identity. Set confidence 0-1 per dimension; use low confidence and add a reviewFlag when unsure.',
        },
        { role: 'user', content: `Classify this contact:\n${profile}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'contact_enrichment', strict: true, schema: ENRICH_SCHEMA } },
      max_tokens: 500,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Enrichment failed (${response.status})`);
  }

  const data = await response.json();
  const enriched = JSON.parse(data.choices[0].message.content);
  const usage = data.usage || {};
  const costUsd = ((usage.prompt_tokens || 0) * INPUT_COST_PER_M + (usage.completion_tokens || 0) * OUTPUT_COST_PER_M) / 1e6;
  return { enriched, costUsd: Math.round(costUsd * 1e6) / 1e6 };
}

// Map an enrichment result onto Contact fields for persistence.
export function buildEnrichmentUpdate(contact, enriched, costUsd) {
  const lead = scoreLead(contact, enriched);
  const coords = resolveCoordinates(enriched.city, enriched.state, enriched.country);
  return {
    industry: enriched.industry || '',
    subIndustry: enriched.subIndustry || '',
    standardizedCompany: enriched.standardizedCompany || '',
    designationRaw: contact.title || '',
    designationCategory: enriched.designationCategory || '',
    department: enriched.department || '',
    seniorityLevel: enriched.seniorityLevel || '',
    city: enriched.city || '',
    state: enriched.state || '',
    country: enriched.country || '',
    postalCode: enriched.postalCode || '',
    latitude: coords ? coords.lat : null,
    longitude: coords ? coords.lng : null,
    tags: Array.isArray(enriched.tags) ? enriched.tags.slice(0, 12) : [],
    aiSummary: enriched.summary || '',
    aiConfidence: enriched.confidence || null,
    reviewFlags: Array.isArray(enriched.reviewFlags) ? enriched.reviewFlags : [],
    leadScore: lead.leadScore,
    leadPriority: lead.leadPriority,
    dataCompleteness: computeCompleteness(contact),
    enrichmentStatus: 'completed',
    locationStatus: (enriched.city || enriched.state) ? 'resolved' : 'pending',
    scanCost: (contact.scanCost || 0) + (costUsd || 0),
  };
}
