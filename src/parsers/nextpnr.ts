import type { Parser } from '../types';

// nextpnr messages carry no source location; they attach to the log file.
export const parseNextpnr: Parser = (text) => {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(Warning|ERROR): (.*)$/.exec(line);
    if (m) out.push({ line: 1, col: 1, severity: m[1] === 'ERROR' ? 'error' as const : 'warning' as const, message: m[2] });
  }
  return out;
};
