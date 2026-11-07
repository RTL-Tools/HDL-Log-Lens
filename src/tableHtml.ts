export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface Column { label: string; num?: boolean }
export interface Cell { text: string; v?: string | number; cls?: string; title?: string } // v: sort key (defaults to text)
export interface TableRow { cells: Cell[]; context?: Record<string, unknown> } // context -> data-vscode-context (right-click menu)
export interface TableOptions { columns: Column[]; rows: TableRow[]; empty: string /* trusted HTML */; filter?: boolean }

// One page shell for every table view: sortable columns, optional filter box, row click/Enter -> {type:'open', i}.
// `i` is the row's position in the data we sent, so it stays right after the user re-sorts; the extension looks the
// target up itself. Sort and filter survive a re-render through the webview state.
export function renderTable(o: TableOptions, nonce: string, cspSource: string): string {
  const td = (c: Cell) =>
    `<td${c.cls ? ` class="${c.cls}"` : ''} data-v="${esc(String(c.v ?? c.text))}"${c.title ? ` title="${esc(c.title)}"` : ''}>${esc(c.text)}</td>`;
  const body = o.rows.map((r, i) =>
    `<tr data-i="${i}" tabindex="0"${r.context ? ` data-vscode-context="${esc(JSON.stringify(r.context))}"` : ''}>${r.cells.map(td).join('')}</tr>`).join('');
  const bar = o.filter ? '<div class="bar"><input id="f" placeholder="Filter…" aria-label="Filter"><span id="cnt"></span></div>' : '';
  const table = o.rows.length
    ? `${bar}<table><thead><tr>${o.columns.map((c) => `<th data-k="${c.num ? 'n' : 's'}">${c.label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`
    : `<p class="empty">${o.empty}</p>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);padding:0;margin:0}
.bar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;padding:4px 8px;background:var(--vscode-editor-background)}
.bar input{flex:1;min-width:8em;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);padding:2px 6px}
#cnt{opacity:.7;white-space:nowrap}
table{border-collapse:collapse;width:100%}
th{position:sticky;top:0;background:var(--vscode-editorWidget-background);text-align:left;cursor:pointer;user-select:none;padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border)}
.bar + table th{top:30px}
th[data-dir=asc]::after{content:' ▲'} th[data-dir=desc]::after{content:' ▼'}
td{padding:3px 8px;white-space:nowrap;max-width:60ch;overflow:hidden;text-overflow:ellipsis}
td.num{text-align:right;font-variant-numeric:tabular-nums} td.neg{color:var(--vscode-errorForeground)}
td.sev.error{color:var(--vscode-errorForeground)} td.sev.warning{color:var(--vscode-editorWarning-foreground)} td.sev.info{color:var(--vscode-editorInfo-foreground)}
td.src{color:var(--vscode-textLink-foreground)}
tbody tr{cursor:pointer} tbody tr:hover{background:var(--vscode-list-hoverBackground)}
tbody tr:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
.empty{padding:8px 12px;opacity:.8}
</style></head><body>${table}
<script nonce="${nonce}">
(function(){
  var tb=document.querySelector('tbody'); if(!tb) return;
  var api=acquireVsCodeApi(), st=api.getState()||{};
  var ths=[].slice.call(document.querySelectorAll('th')), f=document.getElementById('f'), cnt=document.getElementById('cnt');
  function save(){api.setState({col:st.col,dir:st.dir,filter:f?f.value:''});}
  function sortBy(c,dir){
    ths.forEach(function(x){delete x.dataset.dir;}); ths[c].dataset.dir=dir; st.col=c; st.dir=dir;
    var num=ths[c].dataset.k==='n', asc=dir==='asc';
    [].slice.call(tb.rows).sort(function(a,b){var x=a.cells[c].dataset.v,y=b.cells[c].dataset.v;
      return (num?(+x)-(+y):x.localeCompare(y))*(asc?1:-1);}).forEach(function(r){tb.appendChild(r);});
  }
  function filter(){
    var q=f?f.value.toLowerCase():'', n=0;
    [].slice.call(tb.rows).forEach(function(r){var ok=!q||r.textContent.toLowerCase().indexOf(q)>=0; r.hidden=!ok; if(ok)n++;});
    if(cnt) cnt.textContent=n+' / '+tb.rows.length;
  }
  function open(e){var tr=e.target.closest('tr'); if(tr) api.postMessage({type:'open',i:+tr.dataset.i});}
  tb.addEventListener('click',open);
  tb.addEventListener('keydown',function(e){if(e.key==='Enter') open(e);});
  ths.forEach(function(th,c){th.addEventListener('click',function(){sortBy(c,th.dataset.dir==='asc'?'desc':'asc');save();});});
  if(f){f.addEventListener('input',function(){filter();save();}); if(st.filter) f.value=st.filter;}
  if(st.col!==undefined&&ths[st.col]) sortBy(st.col,st.dir);
  filter();
})();
</script></body></html>`;
}

// The page may only ask us to open a row by index; never a path. Anything else is ignored.
export function rowIndex(msg: unknown, count: number): number | undefined {
  const m = msg as { type?: unknown; i?: unknown } | null;
  return m?.type === 'open' && typeof m.i === 'number' && Number.isInteger(m.i) && m.i >= 0 && m.i < count ? m.i : undefined;
}
