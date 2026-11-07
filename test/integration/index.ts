// Runs INSIDE a VS Code Extension Development Host (see run.js). Opens the AES project
// and asserts on what actually lands in the Problems panel.
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as vscode from 'vscode';

const TOOLS = ['verilator', 'yosys', 'nextpnr', 'nvc'];
const ours = () =>
  vscode.languages.getDiagnostics().flatMap(([uri, ds]) =>
    ds.filter((d) => TOOLS.includes(d.source ?? '')).map((d) => ({ uri, d })));

const cursorLine = () => vscode.window.activeTextEditor?.selection.active.line;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let step = '';
async function check(): Promise<void> {
  const api = (await vscode.extensions.getExtension('fpga-james.hdl-log-lens')!.activate()) as { problems: import('../../src/problemsView').ProblemsPanel; timing: import('../../src/timingView').TimingPanel; inline: { annotationsFor(d: vscode.TextDocument): { line: number; text: string; hover: string }[] }; inlineProblems: { notesFor(d: vscode.TextDocument): { line: number; text: string; severity: string }[] } };
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

  // Log Lens table: default order is severity, then file, then line; every row can be waived.
  const prow = api.problems.rows;
  assert.ok(prow.length > 10, 'problem rows loaded');
  assert.equal(prow[0].severity, 'error', 'errors first');
  const rank = { error: 0, warning: 1, info: 2 };
  assert.deepEqual(prow.map((r) => rank[r.severity]), prow.map((r) => rank[r.severity]).sort(), 'sorted by severity');
  assert.ok(prow.every((r) => r.target), 'every row has a waiver target');
  assert.ok(prow.some((r) => r.tool === 'verilator' && r.code === 'UNUSEDSIGNAL'));
  assert.equal(api.problems.rows.length, ours().length, 'table lists exactly the Problems-panel diagnostics');

  // Clicking a table row opens its line (the page sends only the row index).
  const tbIdx = prow.findIndex((r) => r.filePath.endsWith('/tb/native/sv/aes_tb.sv') && r.line === 28);
  assert.ok(tbIdx >= 0, 'an aes_tb.sv:29 error row');
  api.problems.handleMessage({ type: 'open', i: tbIdx });
  for (let i = 0; i < 50 && !(vscode.window.activeTextEditor?.document.fileName.endsWith('/tb/native/sv/aes_tb.sv') && cursorLine() === 28); i++) await sleep(100);
  assert.ok(vscode.window.activeTextEditor?.document.fileName.endsWith('/tb/native/sv/aes_tb.sv'), 'row click opened aes_tb.sv');
  assert.equal(cursorLine(), 28, 'cursor on line 29');

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
  for (let i = 0; i < 50 && !(vscode.window.activeTextEditor?.document.fileName.endsWith('/src/aes_cipher.sv') && cursorLine() === 198); i++) await sleep(100);
  const ed = vscode.window.activeTextEditor!;
  assert.ok(ed.document.fileName.endsWith('/src/aes_cipher.sv'), `row click opened aes_cipher.sv, got ${ed?.document.fileName}`);
  assert.equal(cursorLine(), 198, 'cursor on line 199');

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
  await vscode.commands.executeCommand('workbench.view.extension.hdlLogLensProblems');
  for (let i = 0; i < 50 && !api.problems.resolved; i++) await sleep(100);
  assert.ok(api.problems.resolved, 'Log Lens webview resolved when its tab opened');
  await vscode.commands.executeCommand('workbench.view.extension.hdlLogLensTiming');
  for (let i = 0; i < 50 && !api.timing.resolved; i++) await sleep(100);
  assert.ok(api.timing.resolved, 'timing webview resolved when its tab opened');

  // Inline problem messages: axil_if.sv line 63 (0-based 62) has the UNUSEDSIGNAL warning for 'awready'.
  const axil = await vscode.workspace.openTextDocument(vscode.Uri.file(`${vscode.workspace.workspaceFolders![0].uri.fsPath}/src/axil_if.sv`));
  const notes = api.inlineProblems.notesFor(axil);
  const n63 = notes.find((n) => n.line === 62);
  assert.ok(n63, 'line 63 has an inline problem note');
  assert.match(n63.text, /^UNUSEDSIGNAL: Signal is not used: 'awready'/);
  assert.equal(n63.severity, 'warning');
  assert.equal(new Set(notes.map((n) => n.line)).size, notes.length, 'one note per line');
  assert.ok(notes.every((n) => n.text.length <= 120 + ' (+999 more)'.length), 'notes are truncated');
  const logDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(`${vscode.workspace.workspaceFolders![0].uri.fsPath}/out/reports/yosys/nextpnr.log`));
  assert.deepEqual(api.inlineProblems.notesFor(logDoc), [], 'location-less problems (on a log file) get no inline note');
  await vscode.workspace.getConfiguration('hdlLogLens').update('inlineProblems', false, vscode.ConfigurationTarget.Global);
  assert.deepEqual(api.inlineProblems.notesFor(axil), [], 'toggle off hides inline problems');
  await vscode.workspace.getConfiguration('hdlLogLens').update('inlineProblems', undefined, vscode.ConfigurationTarget.Global);
  assert.ok(api.inlineProblems.notesFor(axil).length > 0, 'and back on');

  // Waivers: quick fix + sidebar node both waive; the file is written, messages disappear, removing the entry restores them.
  const waiverPath = `${os.tmpdir().length > 40 ? '/tmp' : os.tmpdir()}/lens-waive-${process.pid}.json`;
  const lens = vscode.workspace.getConfiguration('hdlLogLens');
  const unused = () => vscode.languages.getDiagnostics().flatMap(([u, ds]) => ds.filter((d) => d.source === 'verilator' && d.code === 'UNUSEDSIGNAL').map((d) => ({ u, d })));
  const waitFor = async (cond: () => boolean, what: string) => {
    for (let i = 0; i < 100 && !cond(); i++) await sleep(100);
    assert.ok(cond(), what);
  };
  fs.writeFileSync(waiverPath, '{oops'); // invalid file first: nothing may be overwritten
  await lens.update('waiverFile', waiverPath, vscode.ConfigurationTarget.Global);
  const sample = unused().find((x) => x.u.fsPath.endsWith('/src/axil_if.sv'))!;
  assert.ok(sample, 'an UNUSEDSIGNAL diagnostic in axil_if.sv to waive');
  const total = unused().length;
  step = 'executeCodeActionProvider';
  await vscode.workspace.openTextDocument(sample.u); // the built-in command needs the file's text model to exist
  const actions = (await vscode.commands.executeCommand('vscode.executeCodeActionProvider', sample.u, sample.d.range, 'quickfix')) as vscode.CodeAction[];
  const mine = actions.filter((a) => /HDL Log Lens/.test(a.title));
  assert.deepEqual(mine.map((a) => a.title), ['Waive this message (HDL Log Lens)', 'Waive all verilator UNUSEDSIGNAL messages (HDL Log Lens)']);

  step = 'waive on invalid file';
  await vscode.commands.executeCommand(mine[0].command!.command, ...mine[0].command!.arguments!, 'ok');
  assert.equal(fs.readFileSync(waiverPath, 'utf8'), '{oops', 'invalid waiver file is never overwritten');
  assert.equal(unused().length, total, 'nothing waived while the file is invalid');

  fs.writeFileSync(waiverPath, '{"waivers":[],"note":"keep me"}');
  await vscode.commands.executeCommand(mine[0].command!.command, ...mine[0].command!.arguments!, 'unused on purpose');
  const w1 = JSON.parse(fs.readFileSync(waiverPath, 'utf8'));
  assert.equal(w1.note, 'keep me', 'other keys in the file survive');
  assert.deepEqual(w1.waivers, [{ tool: 'verilator', code: 'UNUSEDSIGNAL', file: 'src/axil_if.sv', message: sample.d.message, reason: 'unused on purpose' }]);
  await waitFor(() => unused().length === total - 1, 'exactly the one message is gone');
  assert.ok(!unused().some((x) => x.d.message === sample.d.message && x.u.fsPath === sample.u.fsPath));

  // Right-clicking a table row waives the whole type: the context carries the section and the row index.
  const idx = api.problems.rows.findIndex((r) => r.code === 'UNUSEDSIGNAL');
  assert.ok(idx >= 0, 'an UNUSEDSIGNAL row in the table');
  await vscode.commands.executeCommand('hdlLogLens.waiveType', { webview: 'hdlLogLens.problems', webviewSection: 'row', i: idx, preventDefaultContextMenuItems: true }, '');
  await waitFor(() => unused().length === 0, 'every UNUSEDSIGNAL is gone after waiving the type');
  assert.deepEqual(JSON.parse(fs.readFileSync(waiverPath, 'utf8')).waivers.at(-1), { tool: 'verilator', code: 'UNUSEDSIGNAL' });
  assert.ok(ours().length > 0, 'other messages are still shown');

  // Remove the entries: messages come back.
  fs.writeFileSync(waiverPath, '{"waivers":[]}');
  await waitFor(() => unused().length === total, 'removing the waivers restores the messages');
  fs.rmSync(waiverPath);
  await lens.update('waiverFile', undefined, vscode.ConfigurationTarget.Global);

  // Clear command empties the panel of our diagnostics.
  await vscode.commands.executeCommand('hdlLogLens.clear');
  assert.equal(ours().length, 0, 'clear command');
  assert.equal(api.problems.rows.length, 0, 'table empties too');
}

export async function run(): Promise<void> {
  const out = process.env.HDL_LENS_RESULT!;
  try {
    await check();
    fs.writeFileSync(out, 'PASS\n');
  } catch (e) {
    fs.writeFileSync(out, `FAIL (step: ${step}) ${(e as Error).stack}\n`);
    throw e;
  }
}
