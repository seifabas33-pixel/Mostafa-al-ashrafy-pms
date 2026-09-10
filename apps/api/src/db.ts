import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG ? ['query', 'warn', 'error'] : ['warn', 'error'],
  transactionOptions: { maxWait: 10_000, timeout: 20_000 },
});

// SQLite in WAL mode lets readers proceed while a transaction writes.
if ((process.env.DATABASE_URL ?? '').startsWith('file:')) {
  prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;').catch(() => {});
  prisma.$executeRawUnsafe('PRAGMA busy_timeout=10000;').catch(() => {});
}

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
