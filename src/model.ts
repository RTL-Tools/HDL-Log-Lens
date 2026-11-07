import type { Severity } from './types';

export interface Row {
  tool: string;
  logPath: string;
  filePath: string; // where the problem is shown (the log itself when the source wasn't found)
  line: number; // 0-based
  col?: number; // 0-based
  severity: Severity;
  code?: string;
  message: string;
}
export type GroupBy = 'tool' | 'log' | 'file' | 'severity' | 'code';
export interface Group { label: string; rows: Row[] }

const SEV_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
const NO_CODE = '(no code)';

const keyOf = (r: Row, by: GroupBy): string => {
  switch (by) {
    case 'tool': return r.tool;
    case 'log': return r.logPath.split('/').slice(-2).join('/');
    case 'file': return r.filePath;
    case 'severity': return r.severity;
    case 'code': return r.code ?? NO_CODE;
  }
};

const cmpRows = (a: Row, b: Row) =>
  SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.filePath.localeCompare(b.filePath) || a.line - b.line;

export function groupRows(rows: Row[], by: GroupBy): Group[] {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r, by);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  const rank = (label: string) =>
    by === 'severity' ? SEV_ORDER[label as Severity] : label === NO_CODE ? Infinity : 0;
  return [...map]
    .map(([label, rs]) => ({ label, rows: rs.sort(cmpRows) }))
    .sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));
}
