import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortRows, type Row } from '../src/model';

const r = (o: Partial<Row>): Row => ({
  tool: 'verilator', logPath: '/w/out/reports/verilator/lint.log', filePath: '/w/src/a.sv',
  line: 0, severity: 'warning', message: 'm', ...o,
});

test('default order: severity (errors first), then file, then line', () => {
  const rows = [
    r({ severity: 'warning', filePath: '/w/a', line: 5, message: 'w5' }),
    r({ severity: 'info', filePath: '/w/a', line: 1, message: 'i1' }),
    r({ severity: 'error', filePath: '/w/b', line: 1, message: 'eb1' }),
    r({ severity: 'error', filePath: '/w/a', line: 9, message: 'ea9' }),
    r({ severity: 'warning', filePath: '/w/a', line: 2, message: 'w2' }),
  ];
  assert.deepEqual(sortRows(rows).map((x) => x.message), ['ea9', 'eb1', 'w2', 'w5', 'i1']);
});

test('sortRows does not mutate its input; empty input gives empty output', () => {
  const rows = [r({ line: 9 }), r({ line: 1 })];
  sortRows(rows);
  assert.deepEqual(rows.map((x) => x.line), [9, 1]);
  assert.deepEqual(sortRows([]), []);
});
