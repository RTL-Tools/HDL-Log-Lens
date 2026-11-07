import * as path from 'node:path';
import * as vscode from 'vscode';
import { groupRows, type Group, type GroupBy, type Row } from './model';

type Node = { kind: 'group'; group: Group } | { kind: 'row'; row: Row };
const ICON = { error: 'error', warning: 'warning', info: 'info' } as const;

export class ProblemsTree implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly rows: () => Row[], private readonly by: () => GroupBy) {}

  refresh(): void {
    this.emitter.fire();
  }

  getChildren(n?: Node): Node[] {
    if (!n) return groupRows(this.rows(), this.by()).map((group) => ({ kind: 'group', group }));
    return n.kind === 'group' ? n.group.rows.map((row) => ({ kind: 'row', row })) : [];
  }

  getTreeItem(n: Node): vscode.TreeItem {
    if (n.kind === 'group') {
      const item = new vscode.TreeItem(n.group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = String(n.group.rows.length);
      return item;
    }
    const r = n.row;
    const item = new vscode.TreeItem(r.code ? `${r.code}: ${r.message}` : r.message);
    item.description = `${path.basename(r.filePath)}:${r.line + 1}`;
    item.tooltip = `${r.tool}\n${r.filePath}:${r.line + 1}\n${r.message}`;
    item.iconPath = new vscode.ThemeIcon(ICON[r.severity]);
    const pos = new vscode.Position(r.line, r.col ?? 0);
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [vscode.Uri.file(r.filePath), { selection: new vscode.Range(pos, pos) }],
    };
    return item;
  }
}
