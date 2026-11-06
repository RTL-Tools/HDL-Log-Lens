import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNextpnr } from '../src/parsers/nextpnr';
import { fixture } from './helpers';

test('nextpnr.log: 4 location-less warnings, summary line ignored', () => {
  const r = parseNextpnr(fixture('nextpnr/nextpnr.log'));
  assert.equal(r.length, 4);
  assert.ok(r.every((f) => f.severity === 'warning' && f.file === undefined && f.line === 1));
  assert.match(r[0].message, /rst_n_i/);
});

test('ERROR: line becomes an error', () => {
  const r = parseNextpnr('ERROR: boom');
  assert.deepEqual(r.map((f) => [f.severity, f.message]), [['error', 'boom']]);
});

test('Info lines and empty input produce nothing', () => {
  assert.deepEqual(parseNextpnr('Info: hello\r\n'), []);
  assert.deepEqual(parseNextpnr(''), []);
});
