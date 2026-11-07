// Runs INSIDE a VS Code Extension Development Host (see run.js). Opens the AES project
// and asserts on what actually lands in the Problems panel.
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as vscode from 'vscode';

const TOOLS = ['verilator', 'yosys', 'nextpnr', 'nvc'];
const ours = () =>
  vscode.languages.getDiagnostics().flatMap(([uri, ds]) =>
    ds.filter((d) => TOOLS.includes(d.source ?? '')).map((d) => ({ uri, d })));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function check(): Promise<void> {
  const api = (await vscode.extensions.getExtension('fpga-james.hdl-log-lens')!.activate()) as { tree: import('../../src/tree').ProblemsTree; timing: import('../../src/timingView').TimingPanel; inline: { annotationsFor(d: vscode.TextDocument): { line: number; text: string; hover: string }[] } };
  for (let i = 0; i < 100 && !['verilator', 'yosys', 'nextpnr', 'nvc'].every((t) => ours().some((x) => x.d.source === t)); i++) await sleep(300);

  const all = ours();
  const bySource = (s: string) => all.filter((x) => x.d.source === s);

  // Verilator: coded warning jumps to a real source file.
  assert.ok(bySource('verilator').some((x) => x.d.code === 'UNUSEDSIGNAL' && x.uri.fsPath.endsWith('/src/axil_if.sv')), 'verilator UNUSEDSIGNAL in axil_if.sv');

  // Verilator error with a workspace-relative path resolves to the testbench, line 29 (0-based 28).
  assert.ok(bySource('verilator').some((x) => x.uri.fsPath.endsWith('/tb/native/sv/aes_tb.sv') && x.d.range.start.line === 28), 'relative path resolved to aes_tb.sv:29');

  // Yosys: 4 identical raw lines per log collapse to one per log (AES has 4 yosys logs, so <= 4).
  const dup = bySource('yosys').filter((x) => x.uri.fsPath.endsWith('/src/sbox.sv') && x.d.range.start.line === 128 && x.d.message.startsWith("wire '\\m_axi.tdata' is assigned"));
  assert.ok(dup.length >= 1 && dup.length <= 4, `yosys dedupe per log, got ${dup.length}`);
  assert.equal(dup[0].d.range.start.character, 10);

  // nextpnr: location-less -> attached to the log file itself.
  assert.ok(bySource('nextpnr').every((x) => x.uri.fsPath.endsWith('nextpnr.log')) && bySource('nextpnr').length > 0, 'nextpnr attaches to log');

  // Sidebar: default grouping is by tool, one group per tool with problems.
  const labels = () => api.tree.getChildren().map((n) => String(api.tree.getTreeItem(n).label));
  assert.deepEqual(labels(), ['nextpnr', 'nvc', 'verilator', 'yosys']);

  // Switching group-by re-groups: errors first (the aes_tb.sv errors), then warnings.
  await vscode.workspace.getConfiguration('hdlLogLens').update('groupBy', 'severity', vscode.ConfigurationTarget.Global);
  for (let i = 0; i < 20 && labels()[0] !== 'error'; i++) await sleep(100);
  assert.deepEqual(labels(), ['error', 'warning']);
  const errors = api.tree.getChildren(api.tree.getChildren()[0]);
  const targets = errors.map((n) => (api.tree.getTreeItem(n).command?.arguments?.[0] as vscode.Uri).fsPath);
  assert.ok(targets.some((t) => t.endsWith('/tb/native/sv/aes_tb.sv')), `an error row opens aes_tb.sv, got ${targets}`);
  assert.deepEqual(targets, [...targets].sort(), 'rows in a group are sorted by file');

  // Timing table: AES's nextpnr report, one row per source line, worst slack first.
  for (let i = 0; i < 100 && api.timing.rows.length === 0; i++) await sleep(200);
  const rows = api.timing.rows;
  assert.ok(rows.length > 1, 'timing rows loaded');
  assert.ok(rows.every((r) => r.src.file.startsWith('/')), 'every row links to a file');
  assert.equal(new Set(rows.map((r) => `${r.src.file}:${r.src.line}`)).size, rows.length, 'no duplicate lines');
  assert.ok(rows.length <= 200, 'at most 200 lines');
  assert.ok(rows[0].src.file.endsWith('/src/aes_cipher.sv') && rows[0].src.line === 199, `worst line is aes_cipher.sv:199, got ${rows[0].src.file}:${rows[0].src.line}`);
  assert.ok(Math.abs(rows[0].arrivalNs - 3.91) < 0.01 && rows[0].slackNs! > 0 && rows[0].slackNs! < 0.1, 'worst: arrival 3.91 ns, slack +0.09');
  assert.ok(rows[0].endpoints > 100, `many endpoints collapse into line 199, got ${rows[0].endpoints}`);
  const slacks = rows.map((r) => r.slackNs).filter((x): x is number => x !== undefined);
  assert.deepEqual(slacks, [...slacks].sort((a, b) => a - b), 'worst slack first');

  // Clicking a row sends {type:'open', i}; it opens that row's source line.
  api.timing.handleMessage({ type: 'open', i: 0 });
  for (let i = 0; i < 50 && !(vscode.window.activeTextEditor?.document.fileName.endsWith('/src/aes_cipher.sv') && vscode.window.activeTextEditor.selection.active.line === 198); i++) await sleep(100);
  const ed = vscode.window.activeTextEditor!;
  assert.ok(ed.document.fileName.endsWith('/src/aes_cipher.sv'), `row click opened aes_cipher.sv, got ${ed?.document.fileName}`);
  assert.equal(ed.selection.active.line, 198, 'cursor on line 199');

  // Inline annotation: the open aes_cipher.sv gets an end-of-line slack note on line 199 (0-based 198).
  const anns = api.inline.annotationsFor(ed.document);
  const a199 = anns.find((a) => a.line === 198);
  assert.ok(a199, 'line 199 is annotated');
  assert.match(a199.text, /^slack \+0\.\d\d ns · \d+ endpoints$/);
  assert.match(a199.hover, /Worst: .*→/);
  assert.equal(new Set(anns.map((a) => a.line)).size, anns.length, 'one note per line');
  assert.ok(anns.every((a) => a.line < ed.document.lineCount), 'annotations fit the document');
  // Toggling the setting off removes them.
  await vscode.workspace.getConfiguration('hdlLogLens').update('inlineTiming', false, vscode.ConfigurationTarget.Global);
  assert.deepEqual(api.inline.annotationsFor(ed.document), [], 'toggle off hides annotations');
  await vscode.workspace.getConfiguration('hdlLogLens').update('inlineTiming', true, vscode.ConfigurationTarget.Global);

  // Anything else from the page is ignored: a file path, a bad index, a wrong type.
  const before = ed.document.uri.toString();
  for (const bad of [{ type: 'open', file: '/etc/hosts' }, { type: 'open', i: 99999 }, { type: 'open', i: '0' }, { type: 'x', i: 1 }, null, 'hi']) api.timing.handleMessage(bad);
  await sleep(500);
  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), before, 'bad messages open nothing');

  // The Timing view lives in its own bottom-panel container: its auto-generated focus command exists and runs.
  await vscode.commands.executeCommand('workbench.view.extension.hdlLogLensTiming');
  for (let i = 0; i < 50 && !api.timing.resolved; i++) await sleep(100);
  assert.ok(api.timing.resolved, 'timing webview resolved when its tab opened');

  // Clear command empties the panel of our diagnostics.
  await vscode.commands.executeCommand('hdlLogLens.clear');
  assert.equal(ours().length, 0, 'clear command');
  assert.deepEqual(api.tree.getChildren(), [], 'sidebar empties too');
}

export async function run(): Promise<void> {
  const out = process.env.HDL_LENS_RESULT!;
  try {
    await check();
    fs.writeFileSync(out, 'PASS\n');
  } catch (e) {
    fs.writeFileSync(out, `FAIL ${(e as Error).stack}\n`);
    throw e;
  }
}
