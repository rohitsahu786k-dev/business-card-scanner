import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['project', 'exhibition'], default: 'project' },
  description: { type: String, default: '', trim: true },
  eventDate: { type: Date, default: null },
  location: { type: String, default: '', trim: true },
  color: { type: String, default: '#e63232' },

  // --- Exhibition / event metadata (added for Automation Expo 2026) ---
  // All fields are optional so existing projects remain valid without migration.
  slug: { type: String, default: null, trim: true },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  venue: { type: String, default: '', trim: true },
  hall: { type: String, default: '', trim: true },
  city: { type: String, default: '', trim: true },
  state: { type: String, default: '', trim: true },
  country: { type: String, default: '', trim: true },
  campaignName: { type: String, default: '', trim: true },

  // isDefault: auto-selected as the scanner destination for the user.
  // isLocked: prevents accidental deletion/renaming of a seeded event project.
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  isLocked: { type: Boolean, default: false },
}, { timestamps: true });

// A user can own at most one project per slug (idempotent event seeding).
// Legacy projects have slug: null, which is excluded by the $type: 'string'
// partial filter, so the constraint only applies to seeded/slugged projects.
ProjectSchema.index(
  { userId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
);

export default mongoose.models.Project || mongoose.model('Project', ProjectSchema);
