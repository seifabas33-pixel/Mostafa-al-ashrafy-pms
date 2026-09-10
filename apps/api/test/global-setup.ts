import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default function setup() {
  mkdirSync(resolve(root, 'test'), { recursive: true });
  // The test database is a throwaway file created here; remove any previous run's copy.
  for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(resolve(root, `test/test.db${suffix}`), { force: true });
  execSync('npx prisma db push --skip-generate', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:./test/test.db' },
  });
}
