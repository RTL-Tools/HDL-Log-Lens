import * as path from 'node:path';
import type { LineRow } from './timing';
import { renderTable, type Column } from './tableHtml';

const n2 = (n: number) => n.toFixed(2);
const NONE = '1e9'; // sort key for "no value": sorts last when ascending

const COLUMNS: Column[] = [
  { label: 'Source' }, { label: 'Slack (ns)', num: true }, { label: 'Arrival (ns)', num: true },
  { label: 'Endpoints', num: true }, { label: 'Worst endpoint / path' }, { label: 'Report' },
];

export function renderTimingHtml(rows: LineRow[], nonce: string, cspSource: string): string {
  return renderTable({
    columns: COLUMNS,
    empty: 'No timing rows with source locations. Needs a nextpnr <code>*_timing.json</code> with its sibling <code>*_routed.json</code>.',
    rows: rows.map((r) => {
      const label = `${path.basename(r.src.file)}:${r.src.line}`;
      const neg = r.slackNs !== undefined && r.slackNs < 0;
      return {
        cells: [
          { text: label, cls: 'src', title: `${r.src.file}:${r.src.line}` },
          { text: r.slackNs === undefined ? '' : n2(r.slackNs), v: r.slackNs ?? NONE, cls: `num${neg ? ' neg' : ''}` },
          { text: n2(r.arrivalNs), v: r.arrivalNs, cls: 'num' },
          { text: r.endpoints ? String(r.endpoints) : '', v: r.endpoints, cls: 'num' },
          { text: r.worst, title: r.worst }, { text: r.report },
        ],
      };
    }),
  }, nonce, cspSource);
}
