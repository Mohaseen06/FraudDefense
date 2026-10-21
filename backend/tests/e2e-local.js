import assert from 'node:assert/strict';
import { config } from '../src/config/config.js';

const baseUrl = process.env.BACKEND_URL ?? `http://127.0.0.1:${config.port}`;
const responseJson = async (url, options) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  assert.ok(response.ok, `${url} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
};

assert.equal((await responseJson(`${baseUrl}/api/health`)).status, 'ok');
const login = await responseJson(`${baseUrl}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: config.demoEmail, password: config.demoPassword }),
});
assert.ok(login.token, 'login should return a JWT');
const headers = { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' };
const ingest = await responseJson(`${baseUrl}/api/transactions/ingest`, {
  method: 'POST', headers,
  body: JSON.stringify({
    trans_date_trans_time: new Date().toISOString(), cc_num: 'local-e2e-customer',
    trans_num: `local-e2e-${Date.now()}`, category: 'grocery_pos', amt: 18.5,
    lat: 40.7, long: -74.0, merch_lat: 40.71, merch_long: -74.01,
    city_pop: 8000000, dob: '1990-01-01', is_fraud: 0,
  }),
});
assert.ok(ingest.transaction?._id, 'ingest should persist a transaction');
assert.ok(Number.isFinite(ingest.transaction.latencyMs), 'ingest should record scoring latency');
assert.ok(['low', 'borderline', 'high'].includes(ingest.transaction.riskTier));
const feed = await responseJson(`${baseUrl}/api/transactions?limit=100`, { headers });
assert.ok(feed.items.some((item) => item._id === ingest.transaction._id), 'transaction should appear in the paginated feed');
if (ingest.case?._id) {
  const caseDetail = await responseJson(`${baseUrl}/api/cases/${ingest.case._id}`, { headers });
  assert.equal(caseDetail.transactionId._id, ingest.transaction._id);
}
const stats = await responseJson(`${baseUrl}/api/stats`, { headers });
assert.ok(Number.isFinite(stats.averageLatencyMs));
console.log(`Local ingest flow passed (${ingest.transaction.riskTier}, ${ingest.transaction.status}).`);
