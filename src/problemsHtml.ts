import * as path from 'node:path';
import type { Row } from './model';
import { renderTable, type Column } from './tableHtml';

const RANK = { error: 0, warning: 1, info: 2 } as const;
const COLUMNS: Column[] = [
  { label: 'Severity', num: true }, { label: 'Message' }, { label: 'Code' },
  { label: 'Source' }, { label: 'Tool' }, { label: 'Log' },
];

export function renderProblemsHtml(rows: Row[], nonce: string, cspSource: string): string {
  return renderTable({
    columns: COLUMNS,
    filter: true,
    empty: 'No problems found. Logs are read from the paths in <code>hdlLogLens.logGlobs</code>.',
    rows: rows.map((r, i) => {
      const src = `${path.basename(r.filePath)}:${r.line + 1}`;
      return {
        // Right-click menu: contributed to `webview/context` for section "row"; `i` picks the row on our side.
        context: { webviewSection: 'row', i, preventDefaultContextMenuItems: true },
        cells: [
          { text: r.severity, v: RANK[r.severity], cls: `sev ${r.severity}` },
          { text: r.message, title: r.message },
          { text: r.code ?? '' },
          { text: src, cls: 'src', title: `${r.filePath}:${r.line + 1}` },
          { text: r.tool },
          { text: r.logPath.split('/').slice(-2).join('/') },
        ],
      };
    }),
  }, nonce, cspSource);
}
