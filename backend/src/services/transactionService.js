import { config } from '../config/config.js';
import { Transaction } from '../models/Transaction.js';
import { Case } from '../models/Case.js';
import { scoreTransaction } from './mlClient.js';
import { investigate } from './agentsClient.js';

export function amountOf(transaction) {
  const amount = Number(transaction.amt ?? transaction.amount);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

async function customerHistory(TransactionModel, payload, before, dependencies) {
  const customerId = payload.cc_num ?? payload.customer_id;
  if (customerId == null) return { averageAmount: 0, transactionCount: 0 };
  if (dependencies.getCustomerHistory) return dependencies.getCustomerHistory(customerId, before);
  const [summary] = await TransactionModel.aggregate([
    { $match: { $or: [{ 'transaction.cc_num': customerId }, { 'transaction.customer_id': customerId }], receivedAt: { $lt: before } } },
    { $project: { amount: { $convert: { input: { $ifNull: ['$transaction.amt', '$transaction.amount'] }, to: 'double', onError: 0, onNull: 0 } } } },
    { $group: { _id: null, averageAmount: { $avg: '$amount' }, transactionCount: { $sum: 1 } } },
  ]);
  return { averageAmount: summary?.averageAmount ?? 0, transactionCount: summary?.transactionCount ?? 0 };
}

export async function ingestTransaction({ payload, io, dependencies = {} }) {
  const score = dependencies.scoreTransaction ?? scoreTransaction;
  const investigateCase = dependencies.investigate ?? investigate;
  const TransactionModel = dependencies.Transaction ?? Transaction;
  const CaseModel = dependencies.Case ?? Case;
  const now = dependencies.now ?? (() => new Date());
  const receivedAt = now();
  const history = await customerHistory(TransactionModel, payload, receivedAt, dependencies);
  const transaction = await TransactionModel.create({
    externalId: payload.trans_num ?? payload.transaction_id,
    transaction: payload, receivedAt,
    isFraud: Number(payload.is_fraud) === 1 || payload.is_fraud === true,
  });
  const startedAt = Date.now();
  let result;
  try {
    result = await score({
      ...payload,
      customer_avg_amount_past: history.averageAmount,
      customer_txn_count_past: history.transactionCount,
    });
  } catch (error) {
    transaction.latencyMs = Date.now() - startedAt;
    transaction.status = 'scoring_failed';
    transaction.scoringError = String(error.message ?? error).slice(0, 500);
    await transaction.save();
    throw Object.assign(new Error('Transaction saved but scoring is unavailable'), { status: 503, transactionId: transaction.id });
  }

  transaction.scoredAt = now();
  transaction.latencyMs = Date.now() - startedAt;
  transaction.riskScore = result.risk_score;
  transaction.riskTier = result.risk_tier;
  transaction.topContributingFeatures = result.top_contributing_features ?? [];
  let caseRecord = null;
  if (result.risk_tier === 'low') {
    transaction.status = 'approved';
  } else {
    transaction.status = 'case_open';
    const highValue = (amountOf(payload) ?? 0) > config.highValueThreshold;
    caseRecord = await CaseModel.create({
      transactionId: transaction._id, transaction: payload, riskScore: result.risk_score,
      riskTier: result.risk_tier, topContributingFeatures: transaction.topContributingFeatures,
      status: highValue ? 'awaiting_human' : 'pending_investigation', highValue,
    });
    transaction.caseId = caseRecord._id;
    if (!highValue) {
      try {
        const response = await investigateCase({
          case_id: String(caseRecord._id), transaction: payload,
          customer_history_summary: payload.customer_history_summary
            ?? `${history.transactionCount} prior transactions; average amount ${Number(history.averageAmount).toFixed(2)}.`,
          ml_score: result.risk_score, risk_tier: result.risk_tier,
        });
        caseRecord.investigation = response;
        caseRecord.agentTrace = response.agent_trace ?? [];
        const isMock = response.mock === true
          || response.reasons?.some((reason) => String(reason).startsWith('Mock response:'))
          || response.agent_trace?.some((entry) => entry.agent === 'mock-investigator');
        if (isMock) caseRecord.status = 'awaiting_human';
        await caseRecord.save();
      } catch {
        caseRecord.status = 'awaiting_human';
        await caseRecord.save();
      }
    }
  }
  await transaction.save();
  const output = { transaction, case: caseRecord };
  io?.emit('transaction:new', output);
  if (caseRecord) io?.emit('case:updated', caseRecord);
  return output;
}
