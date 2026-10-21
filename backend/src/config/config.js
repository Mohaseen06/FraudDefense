import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
try {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.BACKEND_PORT ?? 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173',
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/fraud-defense'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  mlServiceUrl: process.env.ML_SERVICE_URL ?? 'http://127.0.0.1:8000',
  agentsServiceUrl: process.env.AGENTS_SERVICE_URL ?? 'http://127.0.0.1:8001',
  lowMax: Number(process.env.LOW_MAX ?? 0.3),
  highMin: Number(process.env.HIGH_MIN ?? 0.8),
  highValueThreshold: Number(process.env.HIGH_VALUE_THRESHOLD ?? 1000),
  demoEmail: process.env.DEMO_USER_EMAIL ?? 'analyst@example.local',
  demoPassword: required('DEMO_USER_PASSWORD'),
};

if (!(config.lowMax >= 0 && config.lowMax < config.highMin && config.highMin <= 1)) {
  throw new Error('LOW_MAX and HIGH_MIN must satisfy 0 <= LOW_MAX < HIGH_MIN <= 1');
}
