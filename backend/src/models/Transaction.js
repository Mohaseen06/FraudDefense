import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  externalId: { type: String, index: true, sparse: true },
  transaction: { type: mongoose.Schema.Types.Mixed, required: true },
  receivedAt: { type: Date, required: true },
  scoredAt: Date,
  latencyMs: Number,
  riskScore: { type: Number, min: 0, max: 1 },
  riskTier: { type: String, enum: ['low', 'borderline', 'high'] },
  topContributingFeatures: [{ feature: String, contribution: Number }],
  status: { type: String, enum: ['received', 'approved', 'case_open', 'scoring_failed', 'declined'], default: 'received', index: true },
  isFraud: { type: Boolean, default: false, index: true },
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', default: null },
  scoringError: String,
}, { timestamps: true, minimize: false });

transactionSchema.index({ receivedAt: -1 });
transactionSchema.index({ 'transaction.cc_num': 1, receivedAt: -1 });
transactionSchema.index({ 'transaction.customer_id': 1, receivedAt: -1 });
export const Transaction = mongoose.model('Transaction', transactionSchema);
