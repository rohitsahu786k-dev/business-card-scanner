import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  color: { type: String, default: '#e63232' },
}, { timestamps: true });

export default mongoose.models.Project || mongoose.model('Project', ProjectSchema);
