import * as vscode from 'vscode';
import { problemNotes, type ProblemNote } from './inlineProblems';
import type { ProblemsPanel } from './problemsView';

// Same look as VS Code's git blame: the editor font, muted inlay-hint colour (git's own default for
// git.blame.editorDecorationForeground), 50px gap, no severity colour (the squiggle and gutter carry severity).
export const BLAME_COLOR = 'editorInlayHint.foreground';
export const BLAME_MARGIN = '0 0 0 50px';

export function registerInlineProblems(ctx: vscode.ExtensionContext, panel: ProblemsPanel) {
  const cfg = () => vscode.workspace.getConfiguration('hdlLogLens');
  const enabled = () => cfg().get<boolean>('inlineProblems', true);
  const type = vscode.window.createTextEditorDecorationType({ after: { color: new vscode.ThemeColor(BLAME_COLOR) } });
  // Same function feeds the decorations and the Extension Host test.
  const notesFor = (doc: vscode.TextDocument): ProblemNote[] => (enabled() ? problemNotes(panel.rows, doc.uri.fsPath) : []);

  const apply = (ed: vscode.TextEditor) =>
    ed.setDecorations(type, notesFor(ed.document)
      .filter((n) => n.line < ed.document.lineCount) // the file may have shrunk since the log was written
      .map((n) => ({
        range: ed.document.lineAt(n.line).range,
        renderOptions: { after: { contentText: n.text, margin: BLAME_MARGIN } },
      })));
  const applyAll = () => vscode.window.visibleTextEditors.forEach(apply);

  ctx.subscriptions.push(
    type,
    panel.onDidChangeRows(applyAll),
    vscode.window.onDidChangeVisibleTextEditors(applyAll),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('hdlLogLens.inlineProblems') && applyAll()),
    vscode.commands.registerCommand('hdlLogLens.toggleInlineProblems', () =>
      cfg().update('inlineProblems', !enabled(), vscode.ConfigurationTarget.Global)),
  );
  applyAll();
  return { notesFor };
}
