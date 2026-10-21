import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${Buffer.from(hash).toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, expectedHex] = stored.split(':');
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(await scrypt(password, salt, expected.length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
