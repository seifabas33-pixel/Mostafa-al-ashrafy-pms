// Diagnoses a local run: `npm run doctor`. Checks everything `npm run dev` needs,
// prints the first thing that is actually wrong, and stops rather than guessing further.
import { existsSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Nothing above the Node version check may use a modern API: the most common
// reason this script is run at all is that Node is too old, and a crash here
// would hide the one message the user needs. fileURLToPath works everywhere.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, fix) => {
  console.log(`  FAIL  ${m}`);
  console.log(`\n  Fix:  ${fix}\n`);
  process.exit(1);
};

function portFree(port) {
  return new Promise((done) => {
    const s = createServer();
    s.once('error', (err) => done(err.code !== 'EADDRINUSE'));
    s.once('listening', () => s.close(() => done(true)));
    s.listen(port, '127.0.0.1');
  });
}

console.log('\nAshrafy PMS · local run check\n');

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  fail(
    `Node ${process.versions.node} is too old (need 22 or newer)`,
    'Install the current LTS from https://nodejs.org, then close this terminal, open a new one and run `node -v` again.',
  );
}
pass(`Node ${process.versions.node}`);

if (!existsSync(resolve(root, 'node_modules'))) {
  fail('dependencies are not installed', 'npm run setup');
}
pass('dependencies installed');

if (!existsSync(resolve(root, 'apps/api/.env'))) {
  fail('apps/api/.env is missing', 'npm run setup');
}
pass('apps/api/.env present');

try {
  require.resolve('@prisma/client');
} catch {
  fail('the Prisma client has not been generated', 'npm run setup');
}
pass('Prisma client generated');

const db = resolve(root, 'apps/api/prisma/dev.db');
if (!existsSync(db)) {
  fail('the demo database has not been created', 'npm run setup');
}
if (statSync(db).size < 50_000) {
  fail(
    'the demo database exists but looks empty (not seeded)',
    'npm run db:seed',
  );
}
pass('demo database seeded');

for (const [port, what] of [
  [4000, 'API'],
  [5173, 'web app'],
]) {
  if (!(await portFree(port))) {
    fail(
      `port ${port} (the ${what}) is already in use`,
      `Something else is on that port — most often an older \`npm run dev\` still running in another terminal window. Close it, or on macOS/Linux run \`lsof -ti:${port} | xargs kill\`.`,
    );
  }
  pass(`port ${port} free for the ${what}`);
}

console.log(`
Everything needed is in place. Start it with:

  npm run dev

Then open http://localhost:5173 in a browser ON THIS COMPUTER.
Leave that terminal open — both servers stop when you close it.
`);
