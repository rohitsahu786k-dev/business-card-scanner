import mongoose from 'mongoose';

const MediaSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  fileSize: { type: String, default: '' },
  fileType: { type: String, default: 'image' },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null, index: true },

  // --- Organisation metadata (added for Automation Expo 2026) ---
  // All optional so existing media documents remain valid.
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
  eventSlug: { type: String, default: '' },
  side: { type: String, enum: ['front', 'back', ''], default: '' },
  captureDate: { type: String, default: '' }, // yyyy-mm-dd
  scanMethod: { type: String, enum: ['ai', 'qr', 'manual', 'import', ''], default: '' },
  qualityScore: { type: Number, default: null },
  ocrStatus: { type: String, enum: ['pending', 'done', 'failed', ''], default: '' },
  reviewStatus: { type: String, enum: ['unreviewed', 'reviewed', ''], default: 'unreviewed' },
  duplicateStatus: { type: String, enum: ['unique', 'merged', 'possible', ''], default: '' },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  orientation: { type: String, enum: ['portrait', 'landscape', ''], default: '' },
  imageHash: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.models.Media || mongoose.model('Media', MediaSchema);
