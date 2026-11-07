// Runs inside the Extension Development Host (it is the --extensionTestsPath module). For each step it arranges the
// UI, writes <name>.ready and waits for the driver to take the screenshot and write <name>.done.
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cmd = (c, ...a) => vscode.commands.executeCommand(c, ...a);

exports.run = async function run() {
  const dir = process.env.SHOT_DIR;
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const step = async (name, fn) => {
    await fn();
    await sleep(2500); // let webviews and decorations paint
    fs.writeFileSync(path.join(dir, `${name}.ready`), '');
    while (!fs.existsSync(path.join(dir, `${name}.done`))) await sleep(100);
  };

  const api = await vscode.extensions.getExtension('fpga-james.hdl-log-lens').activate();
  for (let i = 0; i < 150 && !(api.problems.rows.length > 0 && api.timing.rows.length > 0); i++) await sleep(200);
  await cmd('workbench.action.closeSidebar');
  await cmd('workbench.action.closeAuxiliaryBar');
  const open = async (rel, line) => {
    const ed = await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, rel)));
    const p = new vscode.Position(line - 1, 0);
    ed.selection = new vscode.Selection(p, p);
    ed.revealRange(new vscode.Range(p, p), vscode.TextEditorRevealType.InCenter);
  };

  await step('log-lens-table', async () => {
    await open('src/aes_cipher.sv', 199);
    await cmd('workbench.view.extension.hdlLogLensProblems');
    await cmd('workbench.action.toggleMaximizedPanel');
  });
  await step('timing-table', async () => {
    await cmd('workbench.view.extension.hdlLogLensTiming');
  });
  await step('inline-slack', async () => {
    await cmd('workbench.action.toggleMaximizedPanel'); // restore
    await cmd('workbench.action.closePanel');
    await open('src/aes_cipher.sv', 199);
  });
  await step('inline-problems', async () => {
    await open('src/axil_if.sv', 66);
  });
  await step('inline-both', async () => {
    await open('synth/aes_impl_top.sv', 212); // a line with both a problem message and a timing note
  });
  await step('waive-quick-fix', async () => {
    await open('src/axil_if.sv', 63);
    await cmd('editor.action.quickFix');
  });
  fs.writeFileSync(path.join(dir, 'finished'), '');
};
