import mongoose from 'mongoose';

const ContactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
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
}, { timestamps: true });

export default mongoose.models.Contact || mongoose.model('Contact', ContactSchema);
