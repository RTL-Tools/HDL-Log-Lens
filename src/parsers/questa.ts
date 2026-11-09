import type { Finding, Parser, Severity } from '../types';

// Transcripts prefix every line with "# "; vlog/vcom run on their own do not.
const HEAD = /^(?:# )?\*\* (Error|Fatal|Warning|Note)(?: \(suppressible\))?: (.*)$/;
const LOC = /^(\S+?)\((\d+)\):\s*/; // file(line): in either order with the code

const SEV: Record<string, Severity> = { Error: 'error', Fatal: 'error', Warning: 'warning', Note: 'info' };

export const parseQuesta: Parser = (text) => {
  const out: Finding[] = [];
  for (const line of text.split(/\r?\n/)) {
    const h = HEAD.exec(line);
    if (!h) continue;
    let body = h[2];
    let loc = LOC.exec(body);
    if (loc) body = body.slice(loc[0].length);
    const c = /^\(([a-z]+-[\w-]+)\)\s*/.exec(body);
    if (c) body = body.slice(c[0].length);
    if (!loc) { loc = LOC.exec(body); if (loc) body = body.slice(loc[0].length); }
    out.push({ file: loc?.[1], line: loc ? +loc[2] : 1, col: 1, severity: SEV[h[1]], code: c?.[1], message: body });
  }
  return out;
};
