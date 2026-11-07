import type { Severity } from './types';
import type { WaiverTarget } from './waivers';

export interface Row {
  tool: string;
  logPath: string;
  filePath: string; // where the problem is shown (the log itself when the source wasn't found)
  line: number; // 0-based
  col?: number; // 0-based
  severity: Severity;
  code?: string;
  message: string;
  target?: WaiverTarget; // what waiver rules see; present for rows the extension produced
}
const SEV_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

// Default table order: errors first, then by file, then line.
export const sortRows = (rows: Row[]): Row[] =>
  [...rows].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.filePath.localeCompare(b.filePath) || a.line - b.line);
