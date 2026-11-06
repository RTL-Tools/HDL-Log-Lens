import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// out/test/helpers.js -> repo root is two levels up
export const fixture = (rel: string): string =>
  readFileSync(resolve(__dirname, '../../test/fixtures', rel), 'utf8');
