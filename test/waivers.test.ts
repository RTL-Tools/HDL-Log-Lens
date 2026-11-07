import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addWaiver, isWaived, parseWaivers, waiverFileKey, waiverFor, type WaiverTarget } from '../src/waivers';

const T: WaiverTarget = { tool: 'verilator', code: 'UNUSEDSIGNAL', file: 'src/axil_if.sv', message: "Signal is not used: 'awready'" };

test('parseWaivers: valid file, unknown keys dropped, empty/missing list is fine', () => {
  const w = parseWaivers(JSON.stringify({ waivers: [{ tool: 'verilator', code: 'X', reason: 'r', extra: 1 }] }));
  assert.deepEqual(w, [{ tool: 'verilator', code: 'X', reason: 'r' }]);
  assert.deepEqual(parseWaivers('{}'), []);
  assert.deepEqual(parseWaivers(''), []);
});

test('parseWaivers: invalid JSON, wrong shapes and match-everything entries are rejected with a clear message', () => {
  assert.throws(() => parseWaivers('{nope'), /waiver file is not valid JSON/i);
  assert.throws(() => parseWaivers('{"waivers": 3}'), /"waivers" must be an array/);
  assert.throws(() => parseWaivers('{"waivers":[{"code":5}]}'), /#1.*code.*string/);
  assert.throws(() => parseWaivers('{"waivers":[{"tool":"a"},{"reason":"only a reason"}]}'), /#2.*at least one of tool, code, file, message/);
  assert.throws(() => parseWaivers('{"waivers":[{"tool":""}]}'), /#1/);
});

test('isWaived: a type waiver (tool+code) matches any file and message', () => {
  const w = [{ tool: 'verilator', code: 'UNUSEDSIGNAL' }];
  assert.equal(isWaived(w, T), true);
  assert.equal(isWaived(w, { ...T, file: 'src/other.sv', message: 'different' }), true);
  assert.equal(isWaived(w, { ...T, code: 'UNDRIVEN' }), false);
  assert.equal(isWaived(w, { ...T, tool: 'yosys' }), false);
  assert.equal(isWaived(w, { ...T, code: undefined }), false);
});

test('isWaived: a message waiver needs tool, code, file and message text to all match; line is never involved', () => {
  const w = [waiverFor('message', T)];
  assert.equal(isWaived(w, T), true);
  assert.equal(isWaived(w, { ...T, message: "Signal is not used: 'arready'" }), false);
  assert.equal(isWaived(w, { ...T, file: 'src/other.sv' }), false);
});

test('isWaived: file-only waiver waives everything in that file; no waivers waive nothing', () => {
  assert.equal(isWaived([{ file: 'src/axil_if.sv' }], T), true);
  assert.equal(isWaived([{ file: 'src/axil_if.sv' }], { ...T, file: 'src/b.sv' }), false);
  assert.equal(isWaived([], T), false);
});

test('waiverFor: type uses tool+code, or tool+message when the tool has no code; message omits an absent code', () => {
  assert.deepEqual(waiverFor('type', T), { tool: 'verilator', code: 'UNUSEDSIGNAL' });
  assert.deepEqual(waiverFor('type', { ...T, tool: 'yosys', code: undefined }), { tool: 'yosys', message: T.message });
  assert.deepEqual(waiverFor('message', { ...T, code: undefined }), { tool: 'verilator', file: T.file, message: T.message });
});

test('addWaiver: creates the file text, appends, keeps others and reasons, never duplicates', () => {
  const first = addWaiver(undefined, { tool: 'verilator', code: 'A', reason: 'ok' });
  assert.ok(first.endsWith('\n') && first.includes('\n  "waivers": ['));
  const second = addWaiver(first, { tool: 'yosys', message: 'm' });
  assert.deepEqual(parseWaivers(second), [{ tool: 'verilator', code: 'A', reason: 'ok' }, { tool: 'yosys', message: 'm' }]);
  assert.equal(addWaiver(second, { tool: 'yosys', message: 'm', reason: 'later reason' }), second);
});

test('addWaiver refuses to touch an invalid existing file', () => {
  assert.throws(() => addWaiver('{oops', { tool: 'x' }), /not valid JSON/i);
});

test('waiverFileKey: workspace-relative posix path, absolute when outside every root', () => {
  assert.equal(waiverFileKey('/w/proj/src/a.sv', ['/w/proj']), 'src/a.sv');
  assert.equal(waiverFileKey('/w/proj/src/a.sv', ['/x', '/w/proj']), 'src/a.sv');
  assert.equal(waiverFileKey('/elsewhere/a.sv', ['/w/proj']), '/elsewhere/a.sv');
  assert.equal(waiverFileKey('C:\\p\\a.sv', []), 'C:\\p\\a.sv');
});
