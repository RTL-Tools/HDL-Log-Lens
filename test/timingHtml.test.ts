import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTimingHtml } from '../src/timingHtml';
import type { LineRow } from '../src/timing';

const row = (o: Partial<LineRow> = {}): LineRow => ({
  src: { file: '/w/src/aes_cipher.sv', line: 199, col: 5 }, slackNs: 0.09, arrivalNs: 3.911, endpoints: 143,
  worst: 'u.net[31] → u.ff.DI', report: 'aes_impl_top_ecp5', ...o,
});
const html = (rows: LineRow[]) => renderTimingHtml(rows, 'NONCE', 'vscode-webview://x');

test('renders one table row per line: file:line, slack, arrival, endpoint count, worst endpoint', () => {
  const h = html([row()]);
  assert.match(h, /<table/);
  assert.match(h, /data-i="0"/);
  assert.match(h, /aes_cipher\.sv:199/);
  assert.match(h, /title="\/w\/src\/aes_cipher\.sv:199"/);
  assert.match(h, />0\.09</);
  assert.match(h, />3\.91</);
  assert.match(h, />143</);
  assert.match(h, /u\.net\[31\] → u\.ff\.DI/);
  assert.ok(!/Logic|Routing|Type/.test(h), 'breakdown columns are gone');
});

test('negative slack is flagged', () => {
  assert.match(html([row({ slackNs: -2.611 })]), /class="num neg" data-v="-2\.611">-2\.61</);
});

test('escapes HTML in report names, labels and paths', () => {
  const h = html([row({ report: '<img src=x onerror=1>', worst: '<b>', src: { file: '/w/<x>.sv', line: 1, col: 1 } })]);
  assert.ok(!h.includes('<img src=x') && !h.includes('<b>') && !h.includes('/w/<x>.sv'));
});

test('CSP allows only the nonce script; empty state explains itself', () => {
  const h = html([]);
  assert.match(h, /Content-Security-Policy[^>]*script-src 'nonce-NONCE'/);
  assert.match(h, /<script nonce="NONCE">/);
  assert.match(h, /No timing rows with source locations/);
  assert.ok(!/<table/.test(h));
});

test('line without slack or endpoints shows empty cells, not NaN/undefined', () => {
  const h = html([row({ slackNs: undefined, endpoints: 0 })]);
  assert.ok(!h.includes('NaN') && !h.includes('undefined'));
  assert.match(h, /data-v="1e9"><\/td>/);
});
