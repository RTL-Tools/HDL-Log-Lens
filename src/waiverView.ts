import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { addWaiver, isWaived, parseWaivers, waiverFor, type Waiver, type WaiverTarget } from './waivers';

const cfg = () => vscode.workspace.getConfiguration('hdlLogLens');

export class WaiverStore {
  list: Waiver[] = [];

  isWaived(t: WaiverTarget): boolean {
    return isWaived(this.list, t);
  }

  fileUri(): vscode.Uri | undefined {
    const root = vscode.workspace.workspaceFolders?.[0];
    return root && vscode.Uri.file(path.resolve(root.uri.fsPath, cfg().get<string>('waiverFile', 'hdl-log-lens.waivers.json')));
  }

  // An unreadable/invalid file waives nothing: failing open shows more problems, never hides them.
  async load(log: (m: string) => void): Promise<void> {
    this.list = [];
    const f = this.fileUri();
    const text = f && (await fs.promises.readFile(f.fsPath, 'utf8').catch(() => undefined));
    if (!f || text === undefined) return;
    try {
      this.list = parseWaivers(text);
      log(`waivers: ${this.list.length} loaded from ${f.fsPath}`);
    } catch (e) {
      log(`waivers: ${f.fsPath}: ${(e as Error).message}. Nothing is waived until it is fixed.`);
      void vscode.window.showWarningMessage(`HDL Log Lens: ${(e as Error).message}. No messages are waived until the waiver file is fixed.`);
    }
  }
}

// Accepts a target itself (quick fix) or the right-click context of a table row ({webviewSection:'row', i}).
const toTarget = (arg: unknown, rowAt: (i: number) => WaiverTarget | undefined): WaiverTarget | undefined => {
  const c = arg as { webviewSection?: unknown; i?: unknown } | null;
  const t = c?.webviewSection === 'row' && typeof c.i === 'number' ? rowAt(c.i) : arg;
  const o = t as Partial<WaiverTarget> | null;
  return o && typeof o.tool === 'string' && typeof o.file === 'string' && typeof o.message === 'string' ? (o as WaiverTarget) : undefined;
};

export function registerWaiverUi(
  ctx: vscode.ExtensionContext,
  store: WaiverStore,
  log: (m: string) => void,
  lookup: (uri: vscode.Uri, d: vscode.Diagnostic) => WaiverTarget | undefined,
  rowAt: (i: number) => WaiverTarget | undefined,
  onChange: () => void,
): void {
  const reload = async () => {
    await store.load(log);
    onChange();
  };

  const waive = async (kind: 'message' | 'type', arg: unknown, reason?: string) => {
    const target = toTarget(arg, rowAt);
    const file = store.fileUri();
    if (!target) return;
    if (!file) return void vscode.window.showErrorMessage('HDL Log Lens: open a folder to keep a waiver file in.');
    if (reason === undefined) {
      reason = await vscode.window.showInputBox({
        prompt: kind === 'type'
          ? `Waive every ${target.tool}${target.code ? ` ${target.code}` : ''} message${target.code ? '' : ' with this text'}?`
          : `Waive this ${target.tool}${target.code ? ` ${target.code}` : ''} message in ${target.file}?`,
        placeHolder: 'Reason (optional, saved in the waiver file). Esc cancels.',
      });
      if (reason === undefined) return;
    }
    const existing = await fs.promises.readFile(file.fsPath, 'utf8').catch(() => undefined);
    let next: string;
    try {
      next = addWaiver(existing, { ...waiverFor(kind, target), ...(reason ? { reason } : {}) });
    } catch (e) {
      log(`waivers: not writing ${file.fsPath}: ${(e as Error).message}`);
      return void vscode.window.showErrorMessage(`HDL Log Lens: not waiving, ${(e as Error).message} (fix or remove ${path.basename(file.fsPath)} first).`);
    }
    await fs.promises.mkdir(path.dirname(file.fsPath), { recursive: true });
    await fs.promises.writeFile(file.fsPath, next);
    log(`waivers: ${kind} waiver added to ${file.fsPath}`);
    await reload();
    void vscode.window
      .showInformationMessage(`Waived. To undo, remove the entry from ${path.basename(file.fsPath)}.`, 'Open waiver file')
      .then((c) => c && vscode.window.showTextDocument(file));
  };

  const watch = () => {
    const f = store.fileUri();
    if (!f) return [];
    // Folder + file name: the documented form that also works for a file outside the workspace.
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(f.fsPath)), path.basename(f.fsPath)));
    return [w, w.onDidCreate(reload), w.onDidChange(reload), w.onDidDelete(reload)];
  };
  let watchers = watch();

  ctx.subscriptions.push(
    vscode.commands.registerCommand('hdlLogLens.waiveMessage', (arg: unknown, reason?: string) => waive('message', arg, reason)),
    vscode.commands.registerCommand('hdlLogLens.waiveType', (arg: unknown, reason?: string) => waive('type', arg, reason)),
    vscode.commands.registerCommand('hdlLogLens.openWaivers', async () => {
      const f = store.fileUri();
      if (!f) return void vscode.window.showErrorMessage('HDL Log Lens: open a folder first.');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(f)).then(undefined, () =>
        vscode.window.showInformationMessage(`No waiver file yet. It is created the first time you waive a message (${f.fsPath}).`));
    }),
    vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, {
      provideCodeActions(doc, _range, context) {
        return context.diagnostics.flatMap((d) => {
          const t = lookup(doc.uri, d);
          if (!t) return [];
          const action = (cmd: string, title: string) => {
            const a = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
            a.command = { command: cmd, title, arguments: [t] };
            a.diagnostics = [d];
            return a;
          };
          return [
            action('hdlLogLens.waiveMessage', 'Waive this message (HDL Log Lens)'),
            action('hdlLogLens.waiveType', t.code ? `Waive all ${t.tool} ${t.code} messages (HDL Log Lens)` : 'Waive all identical messages (HDL Log Lens)'),
          ];
        });
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('hdlLogLens.waiverFile')) return;
      watchers.forEach((w) => w.dispose());
      watchers = watch();
      void reload();
    }),
    { dispose: () => watchers.forEach((w) => w.dispose()) },
  );
}
