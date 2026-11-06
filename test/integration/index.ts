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
  await vscode.extensions.getExtension('fpga-james.hdl-log-lens')!.activate();
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

  // Clear command empties the panel of our diagnostics.
  await vscode.commands.executeCommand('hdlLogLens.clear');
  assert.equal(ours().length, 0, 'clear command');
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
