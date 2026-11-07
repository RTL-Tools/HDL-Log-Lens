import type { Row } from './model';
import type { Severity } from './types';

export interface ProblemNote { line: number; text: string; severity: Severity } // line is 0-based

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

// One note per source line: the worst problem on it, plus a count of the other distinct messages.
// Rows attached to a log file (no source location) are not "next to the code", so they are skipped.
export function problemNotes(rows: Row[], file: string, maxLen = 120): ProblemNote[] {
  const byLine = new Map<number, { row: Row; text: string }[]>();
  for (const r of rows) {
    if (r.filePath !== file || r.filePath === r.logPath) continue;
    const first = r.message.split('\n').map((s) => s.trim()).find(Boolean) ?? '';
    byLine.set(r.line, [...(byLine.get(r.line) ?? []), { row: r, text: `${r.code ? `${r.code}: ` : ''}${first}` }]);
  }
  return [...byLine].map(([line, items]) => {
    const worst = items.reduce((a, b) => (RANK[b.row.severity] < RANK[a.row.severity] ? b : a));
    const more = new Set(items.map((i) => i.text)).size - 1;
    const text = worst.text.length > maxLen ? `${worst.text.slice(0, maxLen - 1)}…` : worst.text;
    return { line, severity: worst.row.severity, text: more ? `${text} (+${more} more)` : text };
  });
}
