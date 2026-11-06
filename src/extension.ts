import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { parseLog } from './parse';
import { resolvePath } from './resolve';
import type { Severity, Tool } from './types';

const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};
const SOURCE_GLOB = '**/*.{v,vh,sv,svh,vhd,vhdl}';
const EXCLUDE_LOGS = '**/{node_modules,.venv,.bender,.git}/**';
const EXCLUDE_SOURCES = '**/{node_modules,.venv,.bender,.git,out}/**';
const INDEX_TTL_MS = 5000;
const DEBOUNCE_MS = 200;

type PerFile = Map<string, { uri: vscode.Uri; diags: vscode.Diagnostic[] }>;

export function activate(ctx: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('hdl-log-lens');
  const perLog = new Map<string, PerFile>(); // log fsPath -> its diagnostics, replaced wholesale on re-parse
  let index = new Map<string, string[]>(); // source basename -> paths, for the filename-search fallback
  let indexedAt = 0;
  let watchers: vscode.Disposable[] = [];
  const timers = new Map<string, NodeJS.Timeout>();

  const cfg = () => vscode.workspace.getConfiguration('hdlLogLens');

  const rebuild = () => {
    collection.clear();
    const merged = new Map<string, { uri: vscode.Uri; diags: vscode.Diagnostic[] }>();
    for (const files of perLog.values()) {
      for (const [key, v] of files) {
        const m = merged.get(key) ?? { uri: v.uri, diags: [] };
        m.diags.push(...v.diags);
        merged.set(key, m);
      }
    }
    for (const { uri, diags } of merged.values()) collection.set(uri, diags);
  };

  const ensureIndex = async () => {
    if (Date.now() - indexedAt < INDEX_TTL_MS) return;
    const next = new Map<string, string[]>();
    for (const u of await vscode.workspace.findFiles(SOURCE_GLOB, EXCLUDE_SOURCES)) {
      const name = path.basename(u.fsPath);
      next.set(name, [...(next.get(name) ?? []), u.fsPath]);
    }
    index = next;
    indexedAt = Date.now();
  };

  const deleteLog = (uri: vscode.Uri) => {
    if (perLog.delete(uri.fsPath)) rebuild();
  };

  const refreshLog = async (uri: vscode.Uri) => {
    const text = await fs.promises.readFile(uri.fsPath, 'utf8').catch(() => undefined);
    if (text === undefined) return deleteLog(uri);
    const tool = cfg().get<string>('tool', 'auto');
    const parsed = parseLog(uri.fsPath, text, tool === 'auto' ? undefined : (tool as Tool));
    if (!parsed) return deleteLog(uri);

    await ensureIndex();
    const suppress = new Set(cfg().get<string[]>('suppressCodes', []));
    const roots = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const logDir = path.dirname(uri.fsPath);
    const files: PerFile = new Map();
    for (const f of parsed.findings) {
      if (f.code && suppress.has(f.code)) continue;
      const resolved = f.file ? resolvePath(f.file, logDir, roots, (n) => index.get(n) ?? []) : undefined;
      const target = resolved ? vscode.Uri.file(resolved) : uri;
      const range = resolved
        ? new vscode.Range(f.line - 1, f.col - 1, (f.endLine ?? f.line) - 1, (f.endCol ?? f.col) - 1)
        : new vscode.Range(0, 0, 0, 0);
      // Source file could not be found: keep the original location in the text.
      const message = f.file && !resolved ? `${f.file}:${f.line}: ${f.message}` : f.message;
      const d = new vscode.Diagnostic(range, message, SEVERITY[f.severity]);
      d.source = parsed.tool;
      d.code = f.code;
      const entry = files.get(target.toString()) ?? { uri: target, diags: [] };
      entry.diags.push(d);
      files.set(target.toString(), entry);
    }
    perLog.set(uri.fsPath, files);
    rebuild();
  };

  const scheduleRefresh = (uri: vscode.Uri) => {
    clearTimeout(timers.get(uri.fsPath));
    timers.set(uri.fsPath, setTimeout(() => void refreshLog(uri), DEBOUNCE_MS)); // tools write logs incrementally
  };

  const scan = async () => {
    indexedAt = 0;
    const found = new Map<string, vscode.Uri>();
    for (const glob of cfg().get<string[]>('logGlobs', [])) {
      for (const u of await vscode.workspace.findFiles(glob, EXCLUDE_LOGS)) found.set(u.fsPath, u);
    }
    for (const p of [...perLog.keys()]) if (!found.has(p)) perLog.delete(p);
    await Promise.all([...found.values()].map(refreshLog));
    rebuild();
  };

  const watch = () => {
    watchers.forEach((w) => w.dispose());
    watchers = cfg().get<string[]>('logGlobs', []).flatMap((glob) => {
      const w = vscode.workspace.createFileSystemWatcher(glob);
      return [w, w.onDidCreate(scheduleRefresh), w.onDidChange(scheduleRefresh), w.onDidDelete(deleteLog)];
    });
  };

  ctx.subscriptions.push(
    collection,
    vscode.commands.registerCommand('hdlLogLens.clear', () => {
      perLog.clear();
      collection.clear();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('hdlLogLens')) return;
      watch();
      void scan();
    }),
    { dispose: () => { watchers.forEach((w) => w.dispose()); timers.forEach(clearTimeout); } },
  );
  watch();
  void scan();
}

export function deactivate(): void {}
