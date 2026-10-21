import { Router } from 'express';
import { Transaction } from '../models/Transaction.js';
import { Case } from '../models/Case.js';

export const statsRouter = Router();

statsRouter.get('/', async (_req, res, next) => {
  try {
    const [total, fraud, flagged, openCases, latency] = await Promise.all([
      Transaction.countDocuments(),
      Transaction.countDocuments({ isFraud: true }),
      Transaction.countDocuments({ riskTier: { $in: ['borderline', 'high'] } }),
      Case.countDocuments({ status: { $in: ['pending_investigation', 'awaiting_human'] } }),
      Transaction.aggregate([{ $match: { latencyMs: { $type: 'number' } } }, { $group: { _id: null, average: { $avg: '$latencyMs' } } }]),
    ]);
    res.json({ total, fraud, fraudRate: total ? fraud / total : 0, flagged, openCases, averageLatencyMs: latency[0]?.average ?? 0 });
  } catch (error) { next(error); }
});
