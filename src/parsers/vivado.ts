import type { Finding, Parser, Severity } from '../types';

const HEAD = /^(WARNING|CRITICAL WARNING|ERROR): \[([A-Za-z_]+ [\d-]+)\] (.*)$/; // INFO lines are skipped: too noisy
// Trailing location: xvlog "[C:/a/b.sv:9]" or synthesis ["/a/b.v":9]; the lazy path keeps a drive-letter colon.
const LOC = /\s\["?(.+?)"?:(\d+)\]\s*$/;

const SEV: Record<string, Severity> = { WARNING: 'warning', 'CRITICAL WARNING': 'warning', ERROR: 'error' };

export const parseVivado: Parser = (text) => {
  const out: Finding[] = [];
  for (const line of text.split(/\r?\n/)) {
    const h = HEAD.exec(line);
    if (!h) continue;
    const l = LOC.exec(h[3]);
    out.push({
      file: l?.[1], line: l ? +l[2] : 1, col: 1, severity: SEV[h[1]], code: h[2],
      message: l ? h[3].slice(0, l.index) : h[3],
    });
  }
  return out;
};
