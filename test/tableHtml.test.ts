import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTable, rowIndex } from '../src/tableHtml';

test('rowIndex accepts only {type:"open", i} with an in-range integer i', () => {
  assert.equal(rowIndex({ type: 'open', i: 0 }, 3), 0);
  assert.equal(rowIndex({ type: 'open', i: 2 }, 3), 2);
  for (const bad of [{ type: 'open', i: 3 }, { type: 'open', i: -1 }, { type: 'open', i: 1.5 }, { type: 'open', i: '1' },
    { type: 'open', file: '/etc/hosts' }, { type: 'nope', i: 0 }, null, undefined, 'open', 7]) {
    assert.equal(rowIndex(bad, 3), undefined, JSON.stringify(bad));
  }
});

test('renderTable: no filter box unless asked, escaped cell text, sort keys default to the text', () => {
  const cols = [{ label: 'A' }, { label: 'B', num: true }];
  const rows = [{ cells: [{ text: '<x>' }, { text: '5', v: 5, cls: 'num' }] }];
  const plain = renderTable({ columns: cols, rows, empty: 'e' }, 'N', 'c');
  assert.ok(!plain.includes('id="f"'));
  assert.match(plain, /data-v="&#60;x&#62;">&#60;x&#62;</);
  assert.match(plain, /<th data-k="n">B</);
  assert.match(renderTable({ columns: cols, rows, empty: 'e', filter: true }, 'N', 'c'), /id="f"/);
});
