import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { app } from './app.js';
import { config } from './config/config.js';
import { seedDemoUser } from './seed.js';

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: config.frontendOrigin } });
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    socket.data.claims = jwt.verify(token, config.jwtSecret);
    next();
  } catch { next(new Error('Invalid or expired token')); }
});
app.set('io', io);

await mongoose.connect(config.mongoUri);
if (config.nodeEnv !== 'production') await seedDemoUser();
httpServer.listen(config.port, () => console.log(`Fraud Defense API listening on http://localhost:${config.port}`));

async function shutdown() {
  io.close();
  httpServer.close();
  await mongoose.disconnect();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
