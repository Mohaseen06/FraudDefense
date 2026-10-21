import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import { User } from '../models/User.js';
import { verifyPassword } from '../utils/password.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password || password.length > 200) return res.status(400).json({ error: 'Email and password are required' });
    const user = await User.findOne({ email }).select('+passwordHash email displayName role active');
    if (!user?.active || !await verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.json({ token, analyst: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } });
  } catch (error) { next(error); }
});
