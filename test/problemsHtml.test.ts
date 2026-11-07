import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderProblemsHtml } from '../src/problemsHtml';
import type { Row } from '../src/model';

const row = (o: Partial<Row> = {}): Row => ({
  tool: 'verilator', logPath: '/w/out/reports/verilator/lint.log', filePath: '/w/src/axil_if.sv',
  line: 62, col: 23, severity: 'warning', code: 'UNUSEDSIGNAL', message: "Signal is not used: 'awready'", ...o,
});
const html = (rows: Row[]) => renderProblemsHtml(rows, 'NONCE', 'vscode-webview://x');

test('one table row per problem: severity, message, code, file:line (1-based), tool, log', () => {
  const h = html([row()]);
  assert.match(h, /<table/);
  assert.match(h, /data-i="0"/);
  assert.match(h, /class="sev warning"[^>]*>warning</);
  assert.match(h, /Signal is not used: &#39;awready&#39;/);
  assert.match(h, />UNUSEDSIGNAL</);
  assert.match(h, />axil_if\.sv:63</);
  assert.match(h, /title="\/w\/src\/axil_if\.sv:63"/);
  assert.match(h, />verilator</);
  assert.match(h, />verilator\/lint\.log</);
});

test('severity sorts by rank, not alphabetically', () => {
  const h = html([row({ severity: 'error' }), row({ severity: 'warning' }), row({ severity: 'info' })]);
  assert.deepEqual([...h.matchAll(/class="sev \w+" data-v="(\d)"/g)].map((m) => m[1]), ['0', '1', '2']);
});

test('rows carry the right-click context (section + original index) for the Waive menu', () => {
  const h = html([row(), row({ message: 'second' })]);
  assert.match(h, /data-i="1"[^>]*data-vscode-context="\{&#34;webviewSection&#34;:&#34;row&#34;,&#34;i&#34;:1,&#34;preventDefaultContextMenuItems&#34;:true\}"/);
});

test('filter box and row counter are present when there are rows', () => {
  const h = html([row()]);
  assert.match(h, /<input id="f"/);
  assert.match(h, /id="cnt"/);
});

test('missing code gives an empty cell; HTML in messages is escaped', () => {
  const h = html([row({ code: undefined, message: '<script>alert(1)</script>' })]);
  assert.ok(!h.includes('<script>alert(1)'));
  const body = h.slice(h.indexOf('<tbody>'), h.indexOf('</tbody>'));
  assert.ok(!body.includes('undefined') && !body.includes('NaN'), 'no undefined/NaN in cells');
});

test('CSP allows only the nonce script; empty state explains where logs come from', () => {
  const h = html([]);
  assert.match(h, /Content-Security-Policy[^>]*script-src 'nonce-NONCE'/);
  assert.match(h, /No problems found/);
  assert.match(h, /hdlLogLens\.logGlobs/);
  assert.ok(!/<table/.test(h));
});
