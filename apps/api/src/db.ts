import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG ? ['query', 'warn', 'error'] : ['warn', 'error'],
  transactionOptions: { maxWait: 10_000, timeout: 20_000 },
});

// SQLite in WAL mode lets readers proceed while a transaction writes. PRAGMA statements
// return a result row, so they must be issued as queries, not executes.
if ((process.env.DATABASE_URL ?? '').startsWith('file:')) {
  prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;').catch((err) => console.warn('Could not enable WAL mode:', err));
  prisma.$queryRawUnsafe('PRAGMA busy_timeout=10000;').catch((err) => console.warn('Could not set busy_timeout:', err));
}

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
