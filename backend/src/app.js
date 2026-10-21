import express from 'express';
import { config } from './config/config.js';
import { authRouter } from './routes/auth.js';
import { transactionRouter } from './routes/transactions.js';
import { caseRouter } from './routes/cases.js';
import { statsRouter } from './routes/stats.js';
import { modelInfoRouter } from './routes/modelInfo.js';
import { requireAnalyst } from './middleware/auth.js';

export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin === config.frontendOrigin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api', requireAnalyst);
app.use('/api/transactions', transactionRouter);
app.use('/api/cases', caseRouter);
app.use('/api/stats', statsRouter);
app.use('/api/model-info', modelInfoRouter);
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON' });
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? error.message ?? 'Internal server error' : error.message });
});
