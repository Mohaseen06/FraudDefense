import { Router } from 'express';
import mongoose from 'mongoose';
import { Case } from '../models/Case.js';
import { Transaction } from '../models/Transaction.js';
import { writeAudit } from '../services/audit.js';

export const caseRouter = Router();

caseRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const filter = {};
    if (['pending_investigation', 'awaiting_human', 'approved', 'rejected'].includes(req.query.status)) filter.status = req.query.status;
    const [items, total] = await Promise.all([
      Case.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Case.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

caseRouter.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid case id' });
    const item = await Case.findById(req.params.id).populate('transactionId').lean();
    if (!item) return res.status(404).json({ error: 'Case not found' });
    res.json(item);
  } catch (error) { next(error); }
});

async function decide(req, res, next, decision) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid case id' });
    const note = req.body?.note ?? '';
    if (typeof note !== 'string' || note.length > 2000) return res.status(400).json({ error: 'Note must be a string up to 2000 characters' });
    const item = await Case.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Case not found' });
    if (!['pending_investigation', 'awaiting_human'].includes(item.status)) return res.status(409).json({ error: 'Case has already been decided' });
    item.status = decision === 'approve' ? 'approved' : 'rejected';
    item.analystId = req.user._id;
    item.analystNote = note;
    item.decidedAt = new Date();
    await item.save();
    await Transaction.findByIdAndUpdate(item.transactionId, { status: decision === 'approve' ? 'approved' : 'declined' });
    await writeAudit({ req, action: `case.${decision}`, resourceType: 'case', resourceId: item.id, details: { note, highValue: item.highValue } });
    req.app.get('io')?.emit('case:updated', item);
    res.json(item);
  } catch (error) { next(error); }
}

caseRouter.post('/:id/approve', (req, res, next) => decide(req, res, next, 'approve'));
caseRouter.post('/:id/reject', (req, res, next) => decide(req, res, next, 'reject'));
