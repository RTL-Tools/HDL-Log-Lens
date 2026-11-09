import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTool, parseLog } from '../src/parse';
import { parseYosys } from '../src/parsers/yosys';
import { fixture } from './helpers';

test('detects by file name, nextpnr before yosys dir', () => {
  assert.equal(detectTool('/w/out/reports/yosys/nextpnr.log', ''), 'nextpnr');
  assert.equal(detectTool('/w/out/reports/yosys/yosys.log', ''), 'yosys');
});

test('detects by parent folder name', () => {
  assert.equal(detectTool('/w/out/reports/verilator/lint.log', ''), 'verilator');
  assert.equal(detectTool('/w/out/reports/nvc/sim-native.log', ''), 'nvc');
});

test('workspace folder names higher up do not influence detection', () => {
  assert.equal(detectTool('/home/me/nvc-experiments/proj/build/run.log', ''), undefined);
});

test('falls back to log content', () => {
  assert.equal(detectTool('/w/impl/aes_impl_top_ecp5_synth.log', fixture('yosys/yosys.log')), 'yosys');
  assert.equal(detectTool('/w/random.log', '** Error: x\n'), 'nvc');
  assert.equal(detectTool('/w/random.log', '%Warning-X: a.sv:1:1: y\n'), 'verilator');
  assert.equal(detectTool('/w/random.log', 'nothing interesting'), undefined);
});

test('override beats detection; unknown without override gives undefined', () => {
  assert.equal(parseLog('/w/nextpnr.log', 'ERROR: boom at a.v:3.\n', 'yosys')?.tool, 'yosys');
  assert.equal(parseLog('/w/random.log', 'nothing interesting'), undefined);
});

test('parseLog dedupes within the log', () => {
  const text = fixture('yosys/yosys.log');
  const r = parseLog('/w/yosys/yosys.log', text)!;
  assert.equal(r.tool, 'yosys');
  assert.ok(r.findings.length < parseYosys(text).length);
});

test('50 000-line log parses in under a second', () => {
  const line = "%Warning-UNUSED: /p/a.sv:12:5: Signal is not used: 'x'\n   12 | foo\n      | ^\n";
  const big = line.repeat(16667);
  const t = Date.now();
  const r = parseLog('/w/verilator/big.log', big)!;
  assert.ok(Date.now() - t < 1000);
  assert.equal(r.findings.length, 1); // all identical -> deduped
});

test('empty input is fine for every tool override', () => {
  for (const t of ['verilator', 'yosys', 'nextpnr', 'nvc', 'vivado', 'questa'] as const) {
    assert.deepEqual(parseLog('/w/x.log', '', t)?.findings, []);
  }
});

test('detects Vivado and Questa by name and content; Questa wins over NVC on "** Error:"', () => {
  assert.equal(detectTool('/w/out/xvlog.log', ''), 'vivado');
  assert.equal(detectTool('/w/sim/transcript', ''), 'questa');
  assert.equal(detectTool('/w/a.log', 'ERROR: [VRFC 10-91] x [a.v:1]\n'), 'vivado');
  assert.equal(detectTool('/w/a.log', '# ** Warning: (vsim-3764) a.sv(1): x\n'), 'questa');
  assert.equal(detectTool('/w/a.log', '** Error: x\n    > a.vhd:1\n'), 'nvc');
});
