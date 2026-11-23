import 'dotenv/config';

export const SERVER_CONFIG = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI?.trim() ?? '',
  clientOrigin: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === 'production',
  saveIntervalMs: 20_000,
  profileSyncMs: 1_800,
};
