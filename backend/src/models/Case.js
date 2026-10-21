import mongoose from 'mongoose';

const traceEntrySchema = new mongoose.Schema({
  agent: String,
  action: String,
  summary: String,
  timestamp: Date,
}, { _id: false });

const caseSchema = new mongoose.Schema({
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true, index: true },
  transaction: { type: mongoose.Schema.Types.Mixed, required: true },
  riskScore: { type: Number, required: true, min: 0, max: 1 },
  riskTier: { type: String, enum: ['borderline', 'high'], required: true },
  topContributingFeatures: [{ feature: String, contribution: Number }],
  status: { type: String, enum: ['pending_investigation', 'awaiting_human', 'approved', 'rejected'], default: 'pending_investigation', index: true },
  highValue: { type: Boolean, default: false },
  investigation: { type: mongoose.Schema.Types.Mixed, default: null },
  agentTrace: [traceEntrySchema],
  analystId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  analystNote: { type: String, maxlength: 2000, default: '' },
  decidedAt: Date,
}, { timestamps: true, minimize: false });

caseSchema.index({ createdAt: -1 });
export const Case = mongoose.model('Case', caseSchema);
