import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYosys } from '../src/parsers/yosys';
import { dedupe } from '../src/dedupe';
import { fixture } from './helpers';

const SBOX = '/Users/james/Workspace/AES/src/sbox.sv';

test('yosys.log: finds every warning Yosys itself counted (106 total)', () => {
  assert.equal(parseYosys(fixture('yosys/yosys.log')).length, 106);
});

test('yosys.log: repeated sbox.sv:129 m_axi.tdata warning collapses to one with a range', () => {
  const hits = dedupe(parseYosys(fixture('yosys/yosys.log'))).filter(
    (f) => f.file === SBOX && f.line === 129 && f.message.startsWith("wire '\\m_axi.tdata' is assigned"),
  );
  assert.equal(
    parseYosys(fixture('yosys/yosys.log')).filter((f) => f.message.startsWith("wire '\\m_axi.tdata' is assigned") && f.line === 129).length,
    4,
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].col, 11);
  assert.equal(hits[0].endLine, 129);
  assert.equal(hits[0].endCol, 62);
  assert.equal(hits[0].severity, 'warning');
});

test('yosys.log: dedupe removes duplicates and the summary line is not a finding', () => {
  const raw = parseYosys(fixture('yosys/yosys.log'));
  assert.ok(dedupe(raw).length < raw.length);
  assert.ok(raw.every((f) => !f.message.startsWith('Warnings:') && !/unique messages/.test(f.message)));
});

test('prefix form: file:line: Warning', () => {
  const [f] = parseYosys("/p/sbox.sv:94: Warning: Identifier `x' is implicitly declared.");
  assert.deepEqual([f.file, f.line, f.col, f.severity], ['/p/sbox.sv', 94, 1, 'warning']);
  assert.equal(f.message, "Identifier `x' is implicitly declared.");
});

test('prefix form: foo.v:12: ERROR: msg', () => {
  const [f] = parseYosys('foo.v:12: ERROR: msg');
  assert.deepEqual([f.file, f.line, f.severity, f.message], ['foo.v', 12, 'error', 'msg']);
});

test('suffix form: ERROR: msg at foo.v:12.', () => {
  const [f] = parseYosys('ERROR: Bad thing at foo.v:12.');
  assert.deepEqual([f.file, f.line, f.severity, f.message], ['foo.v', 12, 'error', 'Bad thing']);
});

test('no location: attaches to the log (file undefined, 1:1)', () => {
  const [f] = parseYosys('Warning: no location here');
  assert.deepEqual([f.file, f.line, f.col, f.message], [undefined, 1, 1, 'no location here']);
});

test('CRLF and empty input', () => {
  assert.equal(parseYosys('ERROR: x at a.v:3.\r\nWarning: y\r\n').length, 2);
  assert.deepEqual(parseYosys(''), []);
});
