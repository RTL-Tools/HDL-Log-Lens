import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineAnnotations } from '../src/inline';
import type { LineRow } from '../src/timing';

const F = '/w/src/aes_cipher.sv';
const row = (o: Partial<LineRow> = {}): LineRow => ({
  src: { file: F, line: 199, col: 5 }, slackNs: 0.09, arrivalNs: 3.91, endpoints: 143, worst: 'u.net[31] → u.ff.DI', report: 'aes', ...o,
});

test('annotation: 0-based line, slack and endpoint count in the text', () => {
  const [a] = inlineAnnotations([row()], F);
  assert.equal(a.line, 198);
  assert.equal(a.text, 'slack +0.09 ns · 143 endpoints');
  assert.equal(a.negative, false);
});

test('negative slack is flagged; one endpoint is singular; none omits the count', () => {
  assert.deepEqual(inlineAnnotations([row({ slackNs: -2.611, endpoints: 1 })], F).map((a) => [a.text, a.negative]), [['slack -2.61 ns · 1 endpoint', true]]);
  assert.equal(inlineAnnotations([row({ endpoints: 0 })], F)[0].text, 'slack +0.09 ns');
});

test('no slack: shows the arrival time instead', () => {
  assert.equal(inlineAnnotations([row({ slackNs: undefined, endpoints: 0 })], F)[0].text, '3.91 ns');
});

test('hover explains the worst endpoint, arrival, slack and count', () => {
  const [a] = inlineAnnotations([row()], F);
  assert.match(a.hover, /Worst: u\.net\[31\] → u\.ff\.DI/);
  assert.match(a.hover, /arrives at 3\.91 ns, slack \+0\.09 ns \[aes\]/);
  assert.match(a.hover, /143 endpoints end on this line/);
});

test('other files and empty input give no annotations', () => {
  assert.deepEqual(inlineAnnotations([row({ src: { file: '/w/src/x.sv', line: 3, col: 1 } })], F), []);
  assert.deepEqual(inlineAnnotations([], F), []);
});
