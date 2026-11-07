import * as vscode from 'vscode';
import { inlineAnnotations, type Annotation } from './inline';
import type { TimingPanel } from './timingView';

export function registerInline(ctx: vscode.ExtensionContext, panel: TimingPanel) {
  const cfg = () => vscode.workspace.getConfiguration('hdlLogLens');
  const enabled = () => cfg().get<boolean>('inlineTiming', true);
  const type = vscode.window.createTextEditorDecorationType({
    after: { margin: '0 0 0 2em', color: new vscode.ThemeColor('editorCodeLens.foreground') },
  });
  // Same function feeds the decorations and the Extension Host test.
  const annotationsFor = (doc: vscode.TextDocument): Annotation[] => (enabled() ? inlineAnnotations(panel.rows, doc.uri.fsPath) : []);

  const apply = (ed: vscode.TextEditor) =>
    ed.setDecorations(type, annotationsFor(ed.document)
      .filter((a) => a.line < ed.document.lineCount) // the file may have shrunk since the report was written
      .map((a) => ({
        range: ed.document.lineAt(a.line).range,
        hoverMessage: new vscode.MarkdownString().appendText(a.hover),
        renderOptions: { after: { contentText: a.text, color: a.negative ? new vscode.ThemeColor('errorForeground') : undefined } },
      })));
  const applyAll = () => vscode.window.visibleTextEditors.forEach(apply);

  ctx.subscriptions.push(
    type,
    panel.onDidChangeRows(applyAll),
    vscode.window.onDidChangeVisibleTextEditors(applyAll),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('hdlLogLens.inlineTiming') && applyAll()),
    vscode.commands.registerCommand('hdlLogLens.toggleInlineTiming', () =>
      cfg().update('inlineTiming', !enabled(), vscode.ConfigurationTarget.Global)),
  );
  applyAll();
  return { annotationsFor };
}
