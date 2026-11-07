import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { lineRows, netlistSrcLookup, parseTiming, type LineRow, type TimingReport } from './timing';
import { renderTimingHtml } from './timingHtml';

const EXCLUDE = '**/{node_modules,.venv,.bender,.git}/**';
const DEBOUNCE_MS = 200;

export class TimingPanel implements vscode.WebviewViewProvider {
  rows: LineRow[] = [];
  private readonly rowsChanged = new vscode.EventEmitter<void>();
  readonly onDidChangeRows = this.rowsChanged.event;
  resolved = false; // exposed for the Extension Host test
  private view?: vscode.WebviewView;

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.resolved = true;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((m) => this.handleMessage(m));
    this.render();
  }

  update(rows: LineRow[]): void {
    this.rows = rows;
    this.render();
    this.rowsChanged.fire();
  }

  private render(): void {
    if (this.view) this.view.webview.html = renderTimingHtml(this.rows, randomBytes(16).toString('hex'), this.view.webview.cspSource);
  }

  // The page only sends a row index; the file to open comes from our own rows, never from the page.
  handleMessage(msg: unknown): void {
    const i = (msg as { type?: unknown; i?: unknown } | null)?.type === 'open' ? (msg as { i: unknown }).i : undefined;
    const row = typeof i === 'number' && Number.isInteger(i) ? this.rows[i] : undefined;
    if (!row) return;
    const p = new vscode.Position(row.src.line - 1, row.src.col - 1);
    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(row.src.file), { selection: new vscode.Range(p, p) });
  }
}

export function registerTiming(ctx: vscode.ExtensionContext, log: (m: string) => void): TimingPanel {
  const panel = new TimingPanel();
  const reports = new Map<string, { name: string; report: TimingReport }>(); // timing json fsPath -> report
  const cfg = () => vscode.workspace.getConfiguration('hdlLogLens');
  const timers = new Map<string, NodeJS.Timeout>();
  let watchers: vscode.Disposable[] = [];

  const publish = () => panel.update(lineRows([...reports.values()], cfg().get<number>('worstLines', 200)));

  const drop = (uri: vscode.Uri) => {
    if (reports.delete(uri.fsPath)) publish();
  };

  const load = async (uri: vscode.Uri) => {
    try {
      const timing = JSON.parse(await fs.promises.readFile(uri.fsPath, 'utf8'));
      // nextpnr writes <stem>_timing.json next to <stem>_routed.json; the routed netlist carries the HDL `src` of each cell.
      const routed = uri.fsPath.replace(/_timing\.json$/, '_routed.json');
      const netlist = routed !== uri.fsPath ? await fs.promises.readFile(routed, 'utf8').then(JSON.parse, () => undefined) : undefined;
      const report = parseTiming(timing, netlist ? netlistSrcLookup(netlist) : undefined);
      reports.set(uri.fsPath, { name: path.basename(uri.fsPath).replace(/_timing\.json$/, ''), report });
      log(`timing: ${uri.fsPath} -> ${report.paths.length} paths${netlist ? '' : ' (no routed netlist: no source attribution)'}`);
    } catch (e) {
      log(`timing: cannot read ${uri.fsPath}: ${(e as Error).message}`);
      reports.delete(uri.fsPath);
    }
    publish();
  };

  const schedule = (uri: vscode.Uri) => {
    clearTimeout(timers.get(uri.fsPath));
    timers.set(uri.fsPath, setTimeout(() => void load(uri), DEBOUNCE_MS));
  };

  const scan = async () => {
    const found = new Map<string, vscode.Uri>();
    for (const glob of cfg().get<string[]>('timingGlobs', [])) {
      for (const u of await vscode.workspace.findFiles(glob, EXCLUDE)) found.set(u.fsPath, u);
    }
    for (const p of [...reports.keys()]) if (!found.has(p)) reports.delete(p);
    await Promise.all([...found.values()].map(load));
    publish();
  };

  const watch = () => {
    watchers.forEach((w) => w.dispose());
    watchers = cfg().get<string[]>('timingGlobs', []).flatMap((glob) => {
      const w = vscode.workspace.createFileSystemWatcher(glob);
      return [w, w.onDidCreate(schedule), w.onDidChange(schedule), w.onDidDelete(drop)];
    });
  };

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider('hdlLogLens.timing', panel),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('hdlLogLens.worstLines')) publish();
      if (!e.affectsConfiguration('hdlLogLens.timingGlobs')) return;
      watch();
      void scan();
    }),
    { dispose: () => { watchers.forEach((w) => w.dispose()); timers.forEach(clearTimeout); } },
  );
  watch();
  void scan();
  return panel;
}
