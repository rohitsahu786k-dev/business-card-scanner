import mongoose from 'mongoose';

const MediaSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  fileSize: { type: String, default: '' },
  fileType: { type: String, default: 'image' },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
}, { timestamps: true });

export default mongoose.models.Media || mongoose.model('Media', MediaSchema);
