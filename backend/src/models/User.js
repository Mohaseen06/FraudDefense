import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  displayName: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['analyst'], default: 'analyst' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
