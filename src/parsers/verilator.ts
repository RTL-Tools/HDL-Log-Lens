import type { Finding, Parser } from '../types';

const HEAD = /^%(Error|Warning)(?:-([A-Z0-9_]+))?: (.*)$/;
const LOC = /^(.+?):(\d+):(\d+): (.*)$/;

export const parseVerilator: Parser = (text) => {
  const out: Finding[] = [];
  for (const line of text.split(/\r?\n/)) {
    const h = HEAD.exec(line);
    if (!h || h[3].startsWith('Exiting due to')) continue; // context/caret lines never start with %
    const severity = h[1] === 'Error' ? 'error' : 'warning';
    const l = LOC.exec(h[3]);
    out.push(
      l
        ? { file: l[1], line: +l[2], col: +l[3], severity, code: h[2], message: l[4] }
        : { line: 1, col: 1, severity, code: h[2], message: h[3] },
    );
  }
  return out;
};
