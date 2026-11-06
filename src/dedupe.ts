import type { Finding } from './types';

export function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = JSON.stringify([f.file, f.line, f.col, f.endLine, f.endCol, f.severity, f.code, f.message]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
