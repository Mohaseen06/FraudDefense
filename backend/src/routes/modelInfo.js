import { Router } from 'express';
import { config } from '../config/config.js';

export const modelInfoRouter = Router();

modelInfoRouter.get('/', async (_req, res, next) => {
  try {
    const response = await fetch(`${config.mlServiceUrl}/model-info`, { signal: AbortSignal.timeout(4000) });
    const body = await response.json();
    if (!response.ok) return res.status(response.status).json(body);
    res.json(body);
  } catch (error) { next(Object.assign(new Error(`ML service is unavailable: ${error.message}`), { status: 502 })); }
});
