import { AuditLog } from '../models/AuditLog.js';

export function writeAudit({ req, action, resourceType, resourceId, details = {} }) {
  return AuditLog.create({
    actorId: req.user?._id ?? null, actorEmail: req.user?.email ?? 'system', action,
    resourceType, resourceId: String(resourceId), details, ip: req.ip,
  });
}
