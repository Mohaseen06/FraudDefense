import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET ??= 'unit-test-only-secret';
process.env.DEMO_USER_PASSWORD ??= 'unit-test-only-password';
const { ingestTransaction } = await import('../src/services/transactionService.js');

function fakes() {
  const transactions = [];
  const cases = [];
  const Transaction = { aggregate: async () => [], create: async (data) => {
    const doc = { ...data, _id: `tx-${transactions.length + 1}`, id: `tx-${transactions.length + 1}`, save: async () => {} };
    transactions.push(doc);
    return doc;
  } };
  const Case = { create: async (data) => {
    const doc = { ...data, _id: `case-${cases.length + 1}`, save: async () => {} };
    cases.push(doc);
    return doc;
  } };
  return { transactions, cases, Transaction, Case };
}

test('ingest auto-approves a low-risk transaction and emits a live event', async () => {
  const db = fakes();
  const events = [];
  const result = await ingestTransaction({
    payload: { amt: 12.5, is_fraud: 0 },
    io: { emit: (...args) => events.push(args) },
    dependencies: { ...db, scoreTransaction: async () => ({ risk_score: 0.08, risk_tier: 'low', top_contributing_features: [] }) },
  });
  assert.equal(result.transaction.status, 'approved');
  assert.equal(db.cases.length, 0);
  assert.equal(events[0][0], 'transaction:new');
  assert.ok(result.transaction.scoredAt);
  assert.ok(Number.isFinite(result.transaction.latencyMs));
});

test('ingest opens a case and sends unavailable investigations to a human', async () => {
  const db = fakes();
  const result = await ingestTransaction({
    payload: { amt: 75, is_fraud: 0 },
    dependencies: {
      ...db,
      scoreTransaction: async () => ({ risk_score: 0.52, risk_tier: 'borderline', top_contributing_features: [{ feature: 'amount', contribution: 0.2 }] }),
      investigate: async () => { throw new Error('stub offline'); },
    },
  });
  assert.equal(result.transaction.status, 'case_open');
  assert.equal(result.case.status, 'awaiting_human');
  assert.equal(result.case.riskTier, 'borderline');
});

test('high-value cases wait for a human before investigation', async () => {
  const db = fakes();
  let investigationCalled = false;
  const result = await ingestTransaction({
    payload: { amt: 2500 },
    dependencies: {
      ...db,
      scoreTransaction: async () => ({ risk_score: 0.93, risk_tier: 'high', top_contributing_features: [] }),
      investigate: async () => { investigationCalled = true; return {}; },
    },
  });
  assert.equal(result.case.status, 'awaiting_human');
  assert.equal(result.case.highValue, true);
  assert.equal(investigationCalled, false);
});

test('a labelled mock investigation response remains in the human queue', async () => {
  const db = fakes();
  const result = await ingestTransaction({
    payload: { amt: 80 },
    dependencies: {
      ...db,
      scoreTransaction: async () => ({ risk_score: 0.6, risk_tier: 'borderline', top_contributing_features: [] }),
      investigate: async () => ({
        recommendation: 'verify', reasons: ['Mock response: no investigation performed.'],
        agent_trace: [{ agent: 'mock-investigator', action: 'mock', summary: 'Mock only.' }],
      }),
    },
  });
  assert.equal(result.case.status, 'awaiting_human');
  assert.equal(result.case.investigation.recommendation, 'verify');
});

test('prior customer history is added to the online scoring payload', async () => {
  const db = fakes();
  let scoredPayload;
  await ingestTransaction({
    payload: { amt: 40, cc_num: 'customer-1' },
    dependencies: {
      ...db,
      getCustomerHistory: async () => ({ averageAmount: 20, transactionCount: 4 }),
      scoreTransaction: async (payload) => {
        scoredPayload = payload;
        return { risk_score: 0.1, risk_tier: 'low', top_contributing_features: [] };
      },
    },
  });
  assert.equal(scoredPayload.customer_avg_amount_past, 20);
  assert.equal(scoredPayload.customer_txn_count_past, 4);
});
