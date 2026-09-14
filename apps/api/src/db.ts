import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG ? ['query', 'warn', 'error'] : ['warn', 'error'],
  transactionOptions: { maxWait: 10_000, timeout: 20_000 },
});

/**
 * SQLite in WAL mode lets readers proceed while a transaction writes. PRAGMA statements
 * return a result row, so they are issued as queries rather than executes.
 *
 * This is awaited before the app starts serving: fired and forgotten, the first requests
 * could run against the default rollback journal and block each other.
 */
export async function initDb(): Promise<void> {
  if (!(process.env.DATABASE_URL ?? '').startsWith('file:')) return;
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout=10000;');
  } catch (err) {
    console.warn('Could not apply SQLite pragmas:', err);
  }
}

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
