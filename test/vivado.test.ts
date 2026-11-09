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
