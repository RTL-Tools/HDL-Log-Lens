import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuesta } from '../src/parsers/questa';
import { fixture } from './helpers';

test('transcript (real): code, file(line) and severity; the Errors/Warnings summary is not a finding', () => {
  const r = parseQuesta(fixture('questa/transcript'));
  assert.deepEqual(r.map((f) => [f.severity, f.code, f.file, f.line]), [
    ['info', 'vsim-3813', undefined, 1],
    ['warning', 'vsim-3764', 'res.sv', 23],
    ['warning', 'vsim-3764', 'res.sv', 24],
    ['warning', 'vsim-WLF-5000', undefined, 1],
    ['warning', 'vsim-WLF-5001', undefined, 1],
  ]);
  assert.equal(r[1].message, "Stand-alone call to function 'read_by_name' treated as implicit void cast.");
});

// vlog format from Questa docs (file first, then code); no real vlog error log was found.
test('vlog error: "file(line): (code) text" without the transcript prefix', () => {
  const [f] = parseQuesta("** Error: top.sv(12): (vlog-2730) Undefined variable: 'x'.\n");
  assert.deepEqual([f.severity, f.file, f.line, f.code, f.message], ['error', 'top.sv', 12, 'vlog-2730', "Undefined variable: 'x'."]);
});

test('Fatal is an error; (suppressible) is accepted; CRLF and empty input', () => {
  assert.equal(parseQuesta('# ** Fatal: (vsim-3) x\r\n')[0].severity, 'error');
  assert.equal(parseQuesta('** Warning (suppressible): (vlog-2) y')[0].severity, 'warning');
  assert.deepEqual(parseQuesta(''), []);
});
