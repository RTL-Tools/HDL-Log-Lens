import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { parseLog } from './parse';
import type { Row } from './model';
import { resolvePath } from './resolve';
import { registerInline } from './inlineView';
import { registerInlineProblems } from './inlineProblemsView';
import { registerTiming, type TimingPanel } from './timingView';
import { ProblemsPanel } from './problemsView';
import { registerWaiverUi, WaiverStore } from './waiverView';
import { waiverFileKey, type WaiverTarget } from './waivers';
import type { Severity, Tool } from './types';

const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};
const sevOf = (s: vscode.DiagnosticSeverity): Severity =>
  s === vscode.DiagnosticSeverity.Error ? 'error' : s === vscode.DiagnosticSeverity.Warning ? 'warning' : 'info';
const SOURCE_GLOB = '**/*.{v,vh,sv,svh,vhd,vhdl}';
const EXCLUDE_LOGS = '**/{node_modules,.venv,.bender,.git}/**';
const EXCLUDE_SOURCES = '**/{node_modules,.venv,.bender,.git,out}/**';
const INDEX_TTL_MS = 5000;
const DEBOUNCE_MS = 200;

type PerFile = Map<string, { uri: vscode.Uri; diags: vscode.Diagnostic[] }>;

export function activate(ctx: vscode.ExtensionContext): { problems: ProblemsPanel; timing: TimingPanel; inline: ReturnType<typeof registerInline>; inlineProblems: ReturnType<typeof registerInlineProblems> } {
  const collection = vscode.languages.createDiagnosticCollection('hdl-log-lens');
  const channel = vscode.window.createOutputChannel('HDL Log Lens');
  const log = (msg: string) => channel.appendLine(`${new Date().toISOString().slice(11, 23)} ${msg}`);
  const perLog = new Map<string, PerFile>(); // log fsPath -> its diagnostics, replaced wholesale on re-parse
  let index = new Map<string, string[]>(); // source basename -> paths, for the filename-search fallback
  let indexedAt = 0;
  let watchers: vscode.Disposable[] = [];
  const timers = new Map<string, NodeJS.Timeout>();

  const cfg = () => vscode.workspace.getConfiguration('hdlLogLens');

  const waivers = new WaiverStore();
  const targetOf = new WeakMap<vscode.Diagnostic, WaiverTarget>();
  const byKey = new Map<string, WaiverTarget>(); // the quick-fix provider gets fresh Diagnostic copies, so match by content
  const diagKey = (uri: vscode.Uri, d: vscode.Diagnostic) => {
    const code = typeof d.code === 'object' ? d.code.value : d.code;
    return `${uri}|${d.range.start.line}:${d.range.start.character}|${d.source}|${code ?? ''}|${d.message}`;
  };
  let waivedByLog = new Map<string, number>();

  // Table rows come straight from the diagnostics already held per log.
  const rows = (): Row[] =>
    [...perLog].flatMap(([logPath, files]) =>
      [...files.values()].flatMap(({ uri, diags }) =>
        diags.map((d) => ({
          tool: d.source ?? '', logPath, filePath: uri.fsPath, line: d.range.start.line, col: d.range.start.character,
          severity: sevOf(d.severity), code: d.code === undefined ? undefined : String(d.code), message: d.message, target: targetOf.get(d),
        }))));
  const panel = new ProblemsPanel();
  const summary = () => {
    const waived = [...waivedByLog.values()].reduce((a, b) => a + b, 0);
    const n = rows().length;
    return `${n} problem${n === 1 ? '' : 's'}${waived ? ` · ${waived} waived` : ''}`;
  };

  const rebuild = () => {
    byKey.clear();
    collection.clear();
    const merged = new Map<string, { uri: vscode.Uri; diags: vscode.Diagnostic[] }>();
    for (const files of perLog.values()) {
      for (const [key, v] of files) {
        const m = merged.get(key) ?? { uri: v.uri, diags: [] };
        m.diags.push(...v.diags);
        for (const d of v.diags) byKey.set(diagKey(v.uri, d), targetOf.get(d)!);
        merged.set(key, m);
      }
    }
    for (const { uri, diags } of merged.values()) collection.set(uri, diags);
    panel.update(rows(), summary());
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
    waivedByLog.delete(uri.fsPath);
    if (perLog.delete(uri.fsPath)) {
      log(`dropped ${uri.fsPath}`);
      rebuild();
    }
  };

  const refreshLog = async (uri: vscode.Uri) => {
    const text = await fs.promises.readFile(uri.fsPath, 'utf8').catch(() => undefined);
    if (text === undefined) {
      log(`cannot read ${uri.fsPath}`);
      return deleteLog(uri);
    }
    const tool = cfg().get<string>('tool', 'auto');
    const parsed = parseLog(uri.fsPath, text, tool === 'auto' ? undefined : (tool as Tool));
    if (!parsed) {
      log(`no tool detected for ${uri.fsPath} (set hdlLogLens.tool to force one)`);
      return deleteLog(uri);
    }

    await ensureIndex();
    const suppress = new Set(cfg().get<string[]>('suppressCodes', []));
    const roots = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const logDir = path.dirname(uri.fsPath);
    const files: PerFile = new Map();
    let suppressed = 0;
    let unresolved = 0;
    let waived = 0;
    for (const f of parsed.findings) {
      if (f.code && suppress.has(f.code)) {
        suppressed++;
        continue;
      }
      const resolved = f.file ? resolvePath(f.file, logDir, roots, (n) => index.get(n) ?? []) : undefined;
      if (f.file && !resolved) unresolved++;
      // Waivers key on the workspace-relative file shown, not the line (lines drift).
      const wt: WaiverTarget = { tool: parsed.tool, code: f.code, file: waiverFileKey(resolved ?? f.file ?? uri.fsPath, roots), message: f.message };
      if (waivers.isWaived(wt)) {
        waived++;
        continue;
      }
      const target = resolved ? vscode.Uri.file(resolved) : uri;
      const range = resolved
        ? new vscode.Range(f.line - 1, f.col - 1, (f.endLine ?? f.line) - 1, (f.endCol ?? f.col) - 1)
        : new vscode.Range(0, 0, 0, 0);
      // Source file could not be found: keep the original location in the text.
      const message = f.file && !resolved ? `${f.file}:${f.line}: ${f.message}` : f.message;
      const d = new vscode.Diagnostic(range, message, SEVERITY[f.severity]);
      d.source = parsed.tool;
      d.code = f.code;
      targetOf.set(d, wt);
      const entry = files.get(target.toString()) ?? { uri: target, diags: [] };
      entry.diags.push(d);
      files.set(target.toString(), entry);
    }
    perLog.set(uri.fsPath, files);
    waivedByLog.set(uri.fsPath, waived);
    const total = [...files.values()].reduce((n, v) => n + v.diags.length, 0);
    log(`${parsed.tool}: ${uri.fsPath} -> ${total} problems (${suppressed} suppressed, ${waived} waived, ${unresolved} source files not found)`);
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
    for (const p of [...perLog.keys()]) if (!found.has(p)) {
      perLog.delete(p);
      waivedByLog.delete(p);
    }
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath).join(', ') || '(no folder open)';
    log(`scan: ${found.size} log(s) match ${JSON.stringify(cfg().get('logGlobs'))} in ${folders}`);
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
    channel,
    vscode.window.registerWebviewViewProvider('hdlLogLens.problems', panel),
    vscode.commands.registerCommand('hdlLogLens.clear', () => {
      log('clear command');
      perLog.clear();
      rebuild();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (['logGlobs', 'tool', 'suppressCodes'].some((k) => e.affectsConfiguration(`hdlLogLens.${k}`))) {
        watch();
        void scan();
      }
    }),
    { dispose: () => { watchers.forEach((w) => w.dispose()); timers.forEach(clearTimeout); } },
  );
  watch();
  registerWaiverUi(ctx, waivers, log, (uri, d) => byKey.get(diagKey(uri, d)), (i) => panel.rows[i]?.target, () => void scan());
  void waivers.load(log).then(scan); // waivers first, so the first scan already applies them
  const timing = registerTiming(ctx, log);
  const inline = registerInline(ctx, timing);
  const inlineProblems = registerInlineProblems(ctx, panel);
  return { problems: panel, timing, inline, inlineProblems }; // exposed for the Extension Host test
}

export function deactivate(): void {}
