import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerilator } from '../src/parsers/verilator';
import { fixture } from './helpers';

test('lint.log first finding is the WIDTHEXPAND warning', () => {
  const [first] = parseVerilator(fixture('verilator/lint.log'));
  assert.equal(first.file, '/Users/james/Workspace/AES/src/aes_key_schedule.sv');
  assert.equal(first.line, 115);
  assert.equal(first.col, 29);
  assert.equal(first.severity, 'warning');
  assert.equal(first.code, 'WIDTHEXPAND');
  assert.match(first.message, /^Operator FUNCREF 'c_rcon_byte'/);
});

test('lint.log yields only located, coded findings (no context/caret/summary lines)', () => {
  const all = parseVerilator(fixture('verilator/lint.log'));
  assert.ok(all.length > 5);
  for (const f of all) {
    assert.ok(f.file, `missing file: ${f.message}`);
    assert.ok(f.code, `missing code: ${f.message}`);
    assert.doesNotMatch(f.message, /\^~|^\.\.\.|^-/);
  }
});

test('sim-native errors: exactly 3 errors, "Exiting due to" excluded', () => {
  const r = parseVerilator(fixture('verilator/sim-native-errors.log'));
  assert.equal(r.length, 3);
  assert.ok(r.every((f) => f.severity === 'error'));
  assert.equal(r[0].code, undefined);
  assert.equal(r[0].line, 29);
  assert.equal(r[0].col, 43);
  assert.equal(r[2].code, 'PINNOTFOUND');
  assert.equal(r[2].line, 62);
  assert.equal(r[2].col, 36);
});

test('windows drive-letter path is not split at the colon', () => {
  const [f] = parseVerilator("%Warning-UNUSED: C:\\proj\\a.sv:12:5: Signal is not used: 'x'");
  assert.equal(f.file, 'C:\\proj\\a.sv');
  assert.equal(f.line, 12);
  assert.equal(f.col, 5);
});

test('location-less message has no file and sits at 1:1', () => {
  const [f] = parseVerilator('%Warning-DEPRECATED: Something old');
  assert.equal(f.file, undefined);
  assert.equal(f.line, 1);
  assert.equal(f.col, 1);
  assert.equal(f.code, 'DEPRECATED');
});

test('CRLF parses like LF; empty input gives nothing', () => {
  const lf = fixture('verilator/sim-native-errors.log');
  assert.deepEqual(parseVerilator(lf.replace(/\n/g, '\r\n')), parseVerilator(lf));
  assert.deepEqual(parseVerilator(''), []);
});
