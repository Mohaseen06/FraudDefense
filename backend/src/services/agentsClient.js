import { config } from '../config/config.js';

/** Replace this adapter when the investigation service gains real agents and RAG. */
export async function investigate(payload) {
  const response = await fetch(`${config.agentsServiceUrl}/investigate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`Agents service returned ${response.status}`);
  return response.json();
}
