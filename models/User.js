import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  avatarPublicId: { type: String, default: '' },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  resetToken: { type: String, default: null },
  resetExpiry: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
