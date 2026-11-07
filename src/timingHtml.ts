import * as path from 'node:path';
import type { LineRow } from './timing';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n2 = (n: number) => n.toFixed(2);
const NONE = '1e9'; // sort key for "no value": sorts last when ascending

const COLS: { label: string; num: boolean }[] = [
  { label: 'Source', num: false }, { label: 'Slack (ns)', num: true }, { label: 'Arrival (ns)', num: true },
  { label: 'Endpoints', num: true }, { label: 'Worst endpoint / path', num: false }, { label: 'Report', num: false },
];

// The row index (data-i) is all the page sends back; the extension looks the file up itself.
export function renderTimingHtml(rows: LineRow[], nonce: string, cspSource: string): string {
  const cell = (text: string, v: string | number, cls = '', title = '') =>
    `<td${cls ? ` class="${cls}"` : ''} data-v="${esc(String(v))}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</td>`;
  const body = rows.map((r, i) => {
    const label = `${path.basename(r.src.file)}:${r.src.line}`;
    const neg = r.slackNs !== undefined && r.slackNs < 0;
    return `<tr data-i="${i}" tabindex="0">${[
      cell(label, label, 'src', `${r.src.file}:${r.src.line}`),
      cell(r.slackNs === undefined ? '' : n2(r.slackNs), r.slackNs ?? NONE, `num${neg ? ' neg' : ''}`),
      cell(n2(r.arrivalNs), r.arrivalNs, 'num'),
      cell(r.endpoints ? String(r.endpoints) : '', r.endpoints, 'num'),
      cell(r.worst, r.worst, '', r.worst), cell(r.report, r.report),
    ].join('')}</tr>`;
  }).join('');
  const table = rows.length
    ? `<table><thead><tr>${COLS.map((c) => `<th data-k="${c.num ? 'n' : 's'}">${c.label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`
    : '<p class="empty">No timing rows with source locations. Needs a nextpnr <code>*_timing.json</code> with its sibling <code>*_routed.json</code>.</p>';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);padding:0;margin:0}
table{border-collapse:collapse;width:100%}
th{position:sticky;top:0;background:var(--vscode-editorWidget-background);text-align:left;cursor:pointer;user-select:none;padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border)}
th[data-dir=asc]::after{content:' ▲'} th[data-dir=desc]::after{content:' ▼'}
td{padding:3px 8px;white-space:nowrap}
td.num{text-align:right;font-variant-numeric:tabular-nums} td.neg{color:var(--vscode-errorForeground)}
td.src{color:var(--vscode-textLink-foreground)}
tbody tr{cursor:pointer} tbody tr:hover{background:var(--vscode-list-hoverBackground)}
tbody tr:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
.empty{padding:8px 12px;opacity:.8}
</style></head><body>${table}
<script nonce="${nonce}">
(function(){
  var tb=document.querySelector('tbody'); if(!tb) return;
  var api=acquireVsCodeApi();
  function open(e){var tr=e.target.closest('tr'); if(tr) api.postMessage({type:'open',i:+tr.dataset.i});}
  tb.addEventListener('click',open);
  tb.addEventListener('keydown',function(e){if(e.key==='Enter') open(e);});
  document.querySelectorAll('th').forEach(function(th,c){th.addEventListener('click',function(){
    var asc=th.dataset.dir!=='asc';
    document.querySelectorAll('th').forEach(function(x){delete x.dataset.dir;}); th.dataset.dir=asc?'asc':'desc';
    var num=th.dataset.k==='n';
    [].slice.call(tb.rows).sort(function(a,b){var x=a.cells[c].dataset.v,y=b.cells[c].dataset.v;
      return (num?(+x)-(+y):x.localeCompare(y))*(asc?1:-1);}).forEach(function(r){tb.appendChild(r);});
  });});
})();
</script></body></html>`;
}
