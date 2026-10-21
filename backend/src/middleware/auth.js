import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import { User } from '../models/User.js';

export async function requireAnalyst(req, res, next) {
  try {
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const claims = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(claims.sub).select('email displayName role active');
    if (!user?.active || user.role !== 'analyst') return res.status(401).json({ error: 'Invalid analyst session' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
