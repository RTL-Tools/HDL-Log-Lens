import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

// Order: absolute -> log dir -> workspace roots -> filename search.
// The search only counts when it is unambiguous: a wrong jump is worse than none.
export function resolvePath(
  file: string,
  logDir: string,
  roots: string[],
  searchByName: (basename: string) => string[],
): string | undefined {
  if (isAbsolute(file) && existsSync(file)) return file;
  for (const dir of [logDir, ...roots]) {
    const p = join(dir, file);
    if (!isAbsolute(file) && existsSync(p)) return p;
  }
  const hits = searchByName(file.split(/[\\/]/).pop() ?? file);
  return hits.length === 1 ? hits[0] : undefined;
}
