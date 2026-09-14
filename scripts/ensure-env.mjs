// Creates apps/api/.env from .env.example on first setup so `npm run setup` works on a fresh clone.
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '..', 'apps', 'api');
const env = resolve(dir, '.env');
if (!existsSync(env)) {
  copyFileSync(resolve(dir, '.env.example'), env);
  console.log('Created apps/api/.env from .env.example');
} else {
  console.log('apps/api/.env already exists');
}
