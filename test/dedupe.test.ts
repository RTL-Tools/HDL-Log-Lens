import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupe } from '../src/dedupe';
import type { Finding } from '../src/types';

const f = (over: Partial<Finding> = {}): Finding => ({
  file: 'a.sv', line: 1, col: 1, severity: 'warning', message: 'm', ...over,
});

test('dedupe collapses identical findings and keeps first-seen order', () => {
  const out = dedupe([f({ message: 'x' }), f({ message: 'y' }), f({ message: 'x' })]);
  assert.deepEqual(out.map((o) => o.message), ['x', 'y']);
});

test('dedupe keeps findings that differ only by code', () => {
  assert.equal(dedupe([f({ code: 'A' }), f({ code: 'B' })]).length, 2);
});

test('dedupe of empty input is empty', () => {
  assert.deepEqual(dedupe([]), []);
});
