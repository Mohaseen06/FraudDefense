import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorEmail: { type: String, default: 'system' },
  action: { type: String, required: true },
  resourceType: { type: String, required: true },
  resourceId: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: String,
}, { timestamps: true });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
