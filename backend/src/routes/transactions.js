import { Router } from 'express';
import { Transaction } from '../models/Transaction.js';
import { ingestTransaction } from '../services/transactionService.js';
import { writeAudit } from '../services/audit.js';

export const transactionRouter = Router();

transactionRouter.post('/ingest', async (req, res, next) => {
  const payload = req.body?.transaction ?? req.body;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return res.status(400).json({ error: 'Transaction must be a JSON object' });
  if (Object.keys(payload).length === 0 || Object.keys(payload).length > 150) return res.status(400).json({ error: 'Transaction is empty or has too many fields' });
  const rawAmount = payload.amt ?? payload.amount;
  if (rawAmount !== undefined && (!Number.isFinite(Number(rawAmount)) || Number(rawAmount) < 0)) return res.status(400).json({ error: 'Transaction amount must be a non-negative number' });
  try {
    const result = await ingestTransaction({ payload, io: req.app.get('io') });
    await writeAudit({ req, action: 'transaction.ingested', resourceType: 'transaction', resourceId: result.transaction.id, details: { riskTier: result.transaction.riskTier, riskScore: result.transaction.riskScore } });
    res.status(201).json(result);
  } catch (error) {
    if (error.transactionId) {
      await writeAudit({ req, action: 'transaction.scoring_failed', resourceType: 'transaction', resourceId: error.transactionId, details: { message: error.message } }).catch(() => {});
    }
    next(error);
  }
});

transactionRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const filter = {};
    if (['low', 'borderline', 'high'].includes(req.query.riskTier)) filter.riskTier = req.query.riskTier;
    if (['received', 'approved', 'case_open', 'scoring_failed', 'declined'].includes(req.query.status)) filter.status = req.query.status;
    const [items, total] = await Promise.all([
      Transaction.find(filter).sort({ receivedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Transaction.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});
