import { config } from '../config/config.js';

export async function scoreTransaction(transaction) {
  const response = await fetch(`${config.mlServiceUrl}/score`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transaction }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`ML service returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const result = await response.json();
  if (!Number.isFinite(result.risk_score) || result.risk_score < 0 || result.risk_score > 1 || !['low', 'borderline', 'high'].includes(result.risk_tier)) {
    throw new Error('ML service returned an invalid score response');
  }
  return result;
}
