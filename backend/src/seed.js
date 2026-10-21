import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { config } from './config/config.js';
import { User } from './models/User.js';
import { hashPassword } from './utils/password.js';

export async function seedDemoUser() {
  const exists = await User.exists({ email: config.demoEmail.toLowerCase() });
  if (exists) return false;
  await User.create({
    email: config.demoEmail,
    displayName: 'Demo Analyst',
    passwordHash: await hashPassword(config.demoPassword),
    role: 'analyst',
  });
  console.log(`Created demo analyst ${config.demoEmail}`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await mongoose.connect(config.mongoUri);
    await seedDemoUser();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
