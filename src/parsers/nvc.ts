import type { Finding, Parser, Severity } from '../types';

const HEAD = /^\*\* (Error|Fatal|Warning|Note): (.*)$/;
const LOC = /^\s+> (.+?):(\d+)\s*$/;
const CARET = /^\s+\| (\s*)(\^+)/; // gutter-width agnostic: both gutters end in "| "

const SEV: Record<string, Severity> = { Error: 'error', Fatal: 'error', Warning: 'warning', Note: 'info' };

// A header opens a pending finding; the `> file:line` line and caret line that
// follow (before the next header) fill in its location and column span.
export const parseNvc: Parser = (text) => {
  const out: Finding[] = [];
  let cur: Finding | undefined;
  for (const line of text.split(/\r?\n/)) {
    const h = HEAD.exec(line);
    if (h) {
      cur = { line: 1, col: 1, severity: SEV[h[1]], message: h[2] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const l = LOC.exec(line);
    if (l && cur.file === undefined) {
      cur.file = l[1];
      cur.line = +l[2];
      continue;
    }
    const c = CARET.exec(line);
    if (c && cur.file !== undefined && cur.endCol === undefined) {
      cur.col = c[1].length + 1;
      cur.endLine = cur.line;
      cur.endCol = cur.col + c[2].length;
    }
  }
  return out;
};
