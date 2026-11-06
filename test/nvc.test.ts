import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNvc } from '../src/parsers/nvc';
import { fixture } from './helpers';

test('syntax-error.log: two located errors with exact columns from the caret line', () => {
  const r = parseNvc(fixture('nvc/syntax-error.log'));
  assert.equal(r.length, 2);
  assert.ok(r.every((f) => f.severity === 'error' && f.file === 'broken.vhd'));
  assert.deepEqual([r[0].line, r[0].col, r[0].endLine, r[0].endCol], [15, 5, 15, 8]);
  assert.match(r[0].message, /^unexpected end while parsing signal assignment statement/);
  assert.deepEqual([r[1].line, r[1].col, r[1].endCol], [19, 5, 17]);
});

test('fatal-no-location.log: a warning and a fatal(error), both without a file', () => {
  const r = parseNvc(fixture('nvc/fatal-no-location.log'));
  assert.deepEqual(r.map((f) => [f.severity, f.file]), [['warning', undefined], ['error', undefined]]);
  assert.match(r[1].message, /^opening .*aes_regs_pkg\.vhd/);
});

test('location without a caret line: col defaults to 1', () => {
  const [f] = parseNvc('** Warning: w\n    > a.vhd:7\n');
  assert.deepEqual([f.severity, f.file, f.line, f.col, f.endCol], ['warning', 'a.vhd', 7, 1, undefined]);
});

test('Note is information', () => {
  assert.equal(parseNvc('** Note: n')[0].severity, 'info');
});

test('a location line belongs to the nearest preceding header only', () => {
  const r = parseNvc('** Error: first\n** Error: second\n    > b.vhd:3\n');
  assert.deepEqual(r.map((f) => f.file), [undefined, 'b.vhd']);
});

test('wide line numbers (3 digits) still give the right column', () => {
  const [f] = parseNvc('** Error: e\n    > c.vhd:120\n    |\n120 |   foo bar\n    |       ^^^\n');
  assert.deepEqual([f.line, f.col, f.endCol], [120, 7, 10]);
});

test('CRLF and empty input', () => {
  assert.equal(parseNvc('** Error: x\r\n    > a.vhd:1\r\n').length, 1);
  assert.deepEqual(parseNvc(''), []);
});
