import type { Finding, Parser, Severity } from '../types';

const HEAD = /^(WARNING|CRITICAL WARNING|ERROR): \[([A-Za-z_]+ [\d-]+)\] (.*)$/; // INFO lines are skipped: too noisy
// Trailing location: xvlog "[C:/a/b.sv:9]" or synthesis ["/a/b.v":9]; the lazy path keeps a drive-letter colon.
const LOC = /\s\["?(.+?)"?:(\d+)\]\s*$/;
const BLOCK = /^([A-Z][A-Z0-9]*-\d+)#\d+ (Critical Warning|Warning|Error|Advisory|Info)\s*$/; // report_drc / report_methodology
const CDC_ROW = /^\s*\d+\s{2,}(CDC-\d+)\s{2,}(Critical|Warning|Info)\s{2,}(.+)$/;

const SEV: Record<string, Severity> = {
  WARNING: 'warning', 'CRITICAL WARNING': 'warning', ERROR: 'error',
  'Critical Warning': 'warning', Warning: 'warning', Error: 'error', Advisory: 'info', Info: 'info', Critical: 'error',
};

// One parser for Vivado logs and .rpt reports: their line shapes don't overlap. Report findings
// carry no file (the reports name cells and nets, not HDL lines), so they attach to the report.
export const parseVivado: Parser = (text) => {
  const out: Finding[] = [];
  const add = (severity: Severity, code: string | undefined, message: string, f?: [string, number]) =>
    out.push({ file: f?.[0], line: f?.[1] ?? 1, col: 1, severity, code, message });
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = HEAD.exec(line);
    if (h) {
      const l = LOC.exec(h[3]);
      add(SEV[h[1]], h[2], l ? h[3].slice(0, l.index) : h[3], l ? [l[1], +l[2]] : undefined);
      continue;
    }
    const b = BLOCK.exec(line);
    if (b) { // heading, description line, message lines up to "Related violations:" or a blank line
      const body: string[] = [];
      for (i += 2; i < lines.length && lines[i].trim() && !lines[i].startsWith('Related violations:'); i++) body.push(lines[i].trim());
      add(SEV[b[2]], b[1], `${lines[i - body.length - 1].trim()}: ${body.join(' ')}`);
      continue;
    }
    const c = CDC_ROW.exec(line);
    if (c) { // columns are 2+ spaces apart: description, [depth, exception,] source, destination
      const cols = c[3].split(/\s{2,}/);
      add(SEV[c[2]], c[1], `${cols[0]}: ${cols[cols.length - 2]} -> ${cols[cols.length - 1]}`);
      continue;
    }
    if (/^\s+WNS\(ns\)\s+TNS\(ns\)/.test(line)) { // Design Timing Summary: names 2+ spaces apart, then a dashed row, then values
      const names = line.trim().split(/\s{2,}/), vals = lines[i + 2]?.trim().split(/\s+/) ?? [];
      const v = (n: string) => Number(vals[names.indexOf(n)]); // "NA" -> NaN -> never "failed"
      for (const [w, t, kind] of [['WNS(ns)', 'TNS', 'Setup'], ['WHS(ns)', 'THS', 'Hold'], ['WPWS(ns)', 'TPWS', 'Pulse width']])
        if (v(w) < 0) add('error', w.slice(0, 3), `${kind} timing not met: ${w.slice(0, 3)} ${v(w)} ns, ${t} ${v(t + '(ns)')} ns over ${v(t + ' Failing Endpoints')} endpoints`);
    }
  }
  return out;
};
