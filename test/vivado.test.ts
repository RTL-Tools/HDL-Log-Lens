import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVivado } from '../src/parsers/vivado';
import { fixture } from './helpers';

test('xvlog.log (real): located errors keep the drive-letter path; INFO lines are skipped', () => {
  const r = parseVivado(fixture('vivado/xvlog.log'));
  const errs = r.filter((f) => f.file);
  assert.equal(errs.length, 4);
  assert.deepEqual([errs[0].file, errs[0].line, errs[0].severity, errs[0].code], ['C:/Users/visha/Desktop/FV/tiny-tpu/src/pe.sv', 9, 'error', 'VRFC 10-1103']);
  assert.equal(errs[0].message, "net type must be explicitly specified for 'pe_psum_in' when default_nettype is none");
  assert.equal(errs[3].line, 4);
});

test('critical warnings and warnings without a location attach to the log', () => {
  const r = parseVivado(fixture('vivado/xvlog.log')).filter((f) => !f.file);
  assert.deepEqual(r.map((f) => [f.severity, f.code]), [['warning', 'Project 1-19'], ['warning', 'Project 1-19'], ['warning', 'Coretcl 2-105']]);
});

// Synthesis format from AMD docs; no public real log with locations was found.
test('synthesis location in quotes: ["path":line]', () => {
  const [f] = parseVivado("ERROR: [Synth 8-439] module 'foo' not found [\"/w/src/a.v\":10]\n");
  assert.deepEqual([f.file, f.line, f.message, f.severity], ['/w/src/a.v', 10, "module 'foo' not found", 'error']);
});

test('CRLF and empty input', () => {
  assert.equal(parseVivado('WARNING: [Board 49-26] x\r\n').length, 1);
  assert.deepEqual(parseVivado(''), []);
});

test('drc.rpt (real): one finding per violation block, with rule code, severity and message', () => {
  const r = parseVivado(fixture('vivado/drc.rpt'));
  assert.deepEqual(r.map((f) => [f.code, f.severity, f.file]), [['NSTD-1', 'warning', undefined], ['UCIO-1', 'warning', undefined]]);
  assert.match(r[0].message, /^Unspecified I\/O Standard: 18 out of 148 logical ports use I\/O standard/);
});

test('methodology.rpt (real): wrapped messages are joined; the summary table is not a finding', () => {
  const r = parseVivado(fixture('vivado/methodology.rpt'));
  assert.deepEqual(r.map((f) => f.code), ['LUTAR-1', 'SYNTH-6']);
  assert.match(r[0].message, /^LUT drives async reset alert: LUT cell rst_sync_q\[1\]_i_1.*tck_reset_q_reg\[1\]\/CLR\. The LUT may glitch/);
});

test('cdc.rpt (real): one Info finding per row with source -> destination', () => {
  const r = parseVivado(fixture('vivado/cdc.rpt'));
  assert.equal(r.length, 3);
  assert.deepEqual([r[0].code, r[0].severity], ['CDC-3', 'info']);
  assert.equal(r[0].message, '1-bit synchronized with ASYNC_REG property: keys_n[0] -> system_i/pl/inst/core/keys_i/key_meta_reg[0]/D');
});

test('timing_summary.rpt (real, constraints met): no findings', () => {
  assert.deepEqual(parseVivado(fixture('vivado/timing_summary.rpt')), []);
});

// No real failing report was found: same table with the values edited to fail.
test('timing summary with negative slack: setup and hold errors; NA is not a failure', () => {
  const t = (vals: string) => `    WNS(ns)      TNS(ns)  TNS Failing Endpoints  TNS Total Endpoints      WHS(ns)      THS(ns)  THS Failing Endpoints  THS Total Endpoints\n    -------      -------  ---------------------  -------------------      -------      -------  ---------------------  -------------------\n${vals}\n`;
  const r = parseVivado(t('    -0.512      -12.300                     14                20692       -0.040       -0.200                      3                20692'));
  assert.deepEqual(r.map((f) => [f.severity, f.code]), [['error', 'WNS'], ['error', 'WHS']]);
  assert.equal(r[0].message, 'Setup timing not met: WNS -0.512 ns, TNS -12.3 ns over 14 endpoints');
  assert.deepEqual(parseVivado(t('         NA           NA                     NA                   NA           NA           NA                     NA                   NA')), []);
});
