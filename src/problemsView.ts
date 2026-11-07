import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { sortRows, type Row } from './model';
import { renderProblemsHtml } from './problemsHtml';
import { rowIndex } from './tableHtml';

export class ProblemsPanel implements vscode.WebviewViewProvider {
  rows: Row[] = []; // in the order the table was sent: the page's row index `i` points into this
  private readonly rowsChanged = new vscode.EventEmitter<void>();
  readonly onDidChangeRows = this.rowsChanged.event;
  resolved = false; // exposed for the Extension Host test
  private view?: vscode.WebviewView;
  private summary = '';

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.resolved = true;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((m) => this.handleMessage(m));
    this.render();
  }

  update(rows: Row[], summary: string): void {
    this.rows = sortRows(rows);
    this.summary = summary;
    this.render();
    this.rowsChanged.fire();
  }

  private render(): void {
    if (!this.view) return;
    this.view.description = this.summary;
    this.view.webview.html = renderProblemsHtml(this.rows, randomBytes(16).toString('hex'), this.view.webview.cspSource);
  }

  handleMessage(msg: unknown): void {
    const i = rowIndex(msg, this.rows.length);
    if (i === undefined) return;
    const r = this.rows[i];
    const p = new vscode.Position(r.line, r.col ?? 0);
    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(r.filePath), { selection: new vscode.Range(p, p) });
  }
}
