import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problemNotes } from '../src/inlineProblems';
import type { Row } from '../src/model';

const F = '/w/src/axil_if.sv';
const row = (o: Partial<Row> = {}): Row => ({
  tool: 'verilator', logPath: '/w/out/reports/verilator/lint.log', filePath: F, line: 62, severity: 'warning',
  code: 'UNUSEDSIGNAL', message: "Signal is not used: 'awready'", ...o,
});

test('one note per line: "CODE: message", severity, 0-based line from the row', () => {
  assert.deepEqual(problemNotes([row()], F), [{ line: 62, text: "UNUSEDSIGNAL: Signal is not used: 'awready'", severity: 'warning' }]);
});

test('no code: just the message', () => {
  assert.equal(problemNotes([row({ code: undefined, message: 'plain' })], F)[0].text, 'plain');
});

test('several problems on a line: worst severity is shown, the rest counted', () => {
  const [n] = problemNotes([row(), row({ severity: 'error', code: 'E1', message: 'bad' }), row({ message: 'other warning' })], F);
  assert.equal(n.severity, 'error');
  assert.equal(n.text, 'E1: bad (+2 more)');
});

test('identical messages (the same warning in two logs) are one, not "+1 more"', () => {
  const [n] = problemNotes([row(), row({ logPath: '/w/out/reports/other/lint.log' })], F);
  assert.equal(n.text, "UNUSEDSIGNAL: Signal is not used: 'awready'");
});

test('only the first line of a multi-line message, trimmed', () => {
  assert.equal(problemNotes([row({ code: undefined, message: '  first line  \nsecond line\n' })], F)[0].text, 'first line');
});

test('long messages are truncated with an ellipsis to maxLen; the "+N more" suffix is extra', () => {
  const long = 'x'.repeat(300);
  assert.equal(problemNotes([row({ code: undefined, message: long })], F, 50)[0].text, `${'x'.repeat(49)}…`);
  assert.equal(problemNotes([row({ code: undefined, message: long }), row({ message: 'b' })], F, 50)[0].text, `${'x'.repeat(49)}… (+1 more)`);
  assert.equal(problemNotes([row({ code: undefined, message: 'short' })], F, 50)[0].text, 'short');
});

test('other files and location-less rows (attached to a log file) are ignored; empty input is empty', () => {
  assert.deepEqual(problemNotes([row({ filePath: '/w/src/other.sv' })], F), []);
  const logFile = '/w/out/reports/nextpnr/nextpnr.log';
  assert.deepEqual(problemNotes([row({ filePath: logFile, logPath: logFile, line: 0 })], logFile), []);
  assert.deepEqual(problemNotes([], F), []);
});

test('separate lines give separate notes', () => {
  assert.deepEqual(problemNotes([row({ line: 5 }), row({ line: 9 })], F).map((n) => n.line).sort((a, b) => a - b), [5, 9]);
});
