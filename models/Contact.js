import mongoose from 'mongoose';

// One captured side of a business card. The legacy single `cardImage`/
// `cardImagePublicId` fields are kept for backward compatibility; new scans
// also push structured entries here so front + back live on one contact.
const CardImageSchema = new mongoose.Schema({
  side: { type: String, enum: ['front', 'back'], default: 'front' },
  url: { type: String, default: '' },
  publicId: { type: String, default: '' },
  imageHash: { type: String, default: '' },
  qualityScore: { type: Number, default: null },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  scanMethod: { type: String, enum: ['ai', 'qr', 'manual', 'import'], default: 'ai' },
  capturedAt: { type: Date, default: Date.now },
}, { _id: false });

const ContactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
  name: { type: String, default: '', trim: true },
  title: { type: String, default: '', trim: true },
  company: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  mobile: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  website: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true },
  cardImage: { type: String, default: '' },
  cardImagePublicId: { type: String, default: '' },
  favorite: { type: Boolean, default: false },
  scanMethod: { type: String, enum: ['ai', 'qr', 'manual', 'import'], default: 'manual' },
  scanCost: { type: Number, default: 0 }, // USD cost of the AI extraction for this scan
  scanRequestId: { type: String, default: null },

  // --- Front/back card images ---
  cardImages: { type: [CardImageSchema], default: [] },

  // --- Normalized values used for duplicate detection (see lib/normalize.js) ---
  normalizedEmail: { type: String, default: '', index: true },
  normalizedMobile: { type: String, default: '', index: true },
  normalizedPhone: { type: String, default: '' },
  normalizedName: { type: String, default: '' },
  normalizedCompany: { type: String, default: '' },
  dedupeKeys: { type: [String], default: [], index: true },

  // --- Duplicate lifecycle ---
  duplicateStatus: { type: String, enum: ['unique', 'merged', 'possible'], default: 'unique' },
  duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  scanCount: { type: Number, default: 1 },
  seenAtProjects: { type: [mongoose.Schema.Types.ObjectId], default: [] },

  // --- AI enrichment (Section 7); populated asynchronously after save ---
  industry: { type: String, default: '' },
  subIndustry: { type: String, default: '' },
  standardizedCompany: { type: String, default: '' },
  designationRaw: { type: String, default: '' },
  designationCategory: { type: String, default: '' },
  department: { type: String, default: '' },
  seniorityLevel: { type: String, default: '' },
  city: { type: String, default: '', index: true },
  state: { type: String, default: '', index: true },
  country: { type: String, default: '', index: true },
  postalCode: { type: String, default: '' },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  leadPriority: { type: String, default: '' },
  leadScore: { type: Number, default: 0 },
  tags: { type: [String], default: [] },
  dataCompleteness: { type: Number, default: 0 },
  aiSummary: { type: String, default: '' },
  aiConfidence: { type: mongoose.Schema.Types.Mixed, default: null },
  reviewFlags: { type: [String], default: [] },
  enrichmentStatus: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending', index: true },
  locationStatus: { type: String, enum: ['pending', 'resolved', 'failed'], default: 'pending' },
}, { timestamps: true });

ContactSchema.index(
  { userId: 1, scanRequestId: 1 },
  { unique: true, partialFilterExpression: { scanRequestId: { $type: 'string' } } },
);

// Fast duplicate lookups within a user's contacts.
ContactSchema.index({ userId: 1, dedupeKeys: 1 });
// Common analytics groupings (Section 10).
ContactSchema.index({ userId: 1, projectId: 1, createdAt: -1 });
ContactSchema.index({ userId: 1, projectId: 1, industry: 1 });
ContactSchema.index({ userId: 1, projectId: 1, leadPriority: 1 });

export default mongoose.models.Contact || mongoose.model('Contact', ContactSchema);
