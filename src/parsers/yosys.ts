import type { Finding, Parser, Severity } from '../types';

// `<file>[:L[.C][-L2.C2]]: ERROR|Warning: msg`
const PREFIX = /^(.+?):(\d+)(?:\.(\d+))?(?:-(\d+)\.(\d+))?: (ERROR|Warning): (.*)$/;
// `ERROR|Warning: msg [at <file>:L[.C][-L2.C2].]`
const HEAD = /^(ERROR|Warning): (.*)$/;
const AT = / at (\S+?):(\d+)(?:\.(\d+))?(?:-(\d+)\.(\d+))?\.$/;

const sev = (s: string): Severity => (s === 'ERROR' ? 'error' : 'warning');
const num = (s?: string) => (s === undefined ? undefined : +s);

export const parseYosys: Parser = (text) => {
  const out: Finding[] = [];
  for (const line of text.split(/\r?\n/)) {
    const p = PREFIX.exec(line);
    if (p) {
      out.push({ file: p[1], line: +p[2], col: num(p[3]) ?? 1, endLine: num(p[4]), endCol: num(p[5]), severity: sev(p[6]), message: p[7] });
      continue;
    }
    const h = HEAD.exec(line);
    if (!h) continue;
    const a = AT.exec(h[2]);
    out.push(
      a
        ? { file: a[1], line: +a[2], col: num(a[3]) ?? 1, endLine: num(a[4]), endCol: num(a[5]), severity: sev(h[1]), message: h[2].slice(0, a.index) }
        : { line: 1, col: 1, severity: sev(h[1]), message: h[2] },
    );
  }
  return out;
};
