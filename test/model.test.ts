import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupRows, type Row } from '../src/model';

const r = (o: Partial<Row>): Row => ({
  tool: 'verilator', logPath: '/w/out/reports/verilator/lint.log', filePath: '/w/src/a.sv',
  line: 0, severity: 'warning', message: 'm', ...o,
});

test('group by tool: alphabetical groups with counts', () => {
  const g = groupRows([r({ tool: 'yosys' }), r({ tool: 'nvc' }), r({ tool: 'yosys' })], 'tool');
  assert.deepEqual(g.map((x) => [x.label, x.rows.length]), [['nvc', 1], ['yosys', 2]]);
});

test('group by severity: errors first, then warnings, then info', () => {
  const g = groupRows([r({ severity: 'info' }), r({ severity: 'warning' }), r({ severity: 'error' })], 'severity');
  assert.deepEqual(g.map((x) => x.label), ['error', 'warning', 'info']);
});

test('group by log uses the path relative-looking tail "folder/file"', () => {
  const g = groupRows([r({}), r({ logPath: '/w/out/reports/yosys/yosys.log' })], 'log');
  assert.deepEqual(g.map((x) => x.label), ['verilator/lint.log', 'yosys/yosys.log']);
});

test('group by code: missing code is grouped as "(no code)" and sorts last', () => {
  const g = groupRows([r({ code: undefined }), r({ code: 'UNUSED' })], 'code');
  assert.deepEqual(g.map((x) => x.label), ['UNUSED', '(no code)']);
});

test('group by file: labelled by file path', () => {
  const g = groupRows([r({ filePath: '/w/src/b.sv' }), r({ filePath: '/w/src/a.sv' })], 'file');
  assert.deepEqual(g.map((x) => x.label), ['/w/src/a.sv', '/w/src/b.sv']);
});

test('rows inside a group sort by severity, then file, then line', () => {
  const rows = [
    r({ severity: 'warning', filePath: '/w/a', line: 5, message: 'w5' }),
    r({ severity: 'error', filePath: '/w/b', line: 1, message: 'eb1' }),
    r({ severity: 'error', filePath: '/w/a', line: 9, message: 'ea9' }),
    r({ severity: 'warning', filePath: '/w/a', line: 2, message: 'w2' }),
  ];
  assert.deepEqual(groupRows(rows, 'tool')[0].rows.map((x) => x.message), ['ea9', 'eb1', 'w2', 'w5']);
});

test('does not mutate its input; empty input gives no groups', () => {
  const rows = [r({ line: 9 }), r({ line: 1 })];
  groupRows(rows, 'tool');
  assert.deepEqual(rows.map((x) => x.line), [9, 1]);
  assert.deepEqual(groupRows([], 'tool'), []);
});
