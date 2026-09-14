import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default function setup() {
  // Prisma resolves a relative SQLite `file:` URL against the SCHEMA directory, so
  // DATABASE_URL=file:./test/test.db lands in apps/api/prisma/test, not apps/api/test.
  // Deleting the wrong path silently reused the previous run's database.
  const dbDir = resolve(root, 'prisma', 'test');
  mkdirSync(dbDir, { recursive: true });
  for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(resolve(dbDir, `test.db${suffix}`), { force: true });
  execSync('npx prisma db push --skip-generate', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:./test/test.db' },
  });
}
