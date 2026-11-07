import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hotspots, lineRows, netlistSrcLookup, parseTiming, pickUserSrc } from '../src/timing';
import { fixture } from './helpers';

const timing = () => JSON.parse(fixture('timing/fail_timing.json'));
const netlist = () => JSON.parse(fixture('timing/fail_routed.json'));
const near = (a: number | undefined, b: number, eps = 0.003) =>
  assert.ok(a !== undefined && Math.abs(a - b) < eps, `${a} !~ ${b}`);
const CLK = '$glbnet$clk_i$TRELLIS_IO_IN';
const CIPHER = '/Users/james/Workspace/AES/src/aes_cipher.sv';
const CORE = '/Users/james/Workspace/AES/src/aes_core.sv';

test('clock slack = target period - achieved period (failing run: -2.611 ns)', () => {
  const [c] = parseTiming(timing()).clocks;
  assert.equal(c.clock, CLK);
  assert.equal(c.constraintMHz, 400);
  near(c.achievedMHz, 195.656, 0.01);
  near(c.slackNs, 2.5 - 1000 / 195.6564178466797);
});

test('paths are worst-first: the failing same-clock path, then async paths by delay', () => {
  const { paths } = parseTiming(timing());
  assert.deepEqual(paths.map((p) => p.from), [`posedge ${CLK}`, `posedge ${CLK}`, '<async>']);
  assert.equal(paths[0].hops.length, 69);
  near(paths[0].totalNs, 5.111);
  near(paths[0].slackNs, -2.611);
  assert.equal(paths[1].to, '<async>');
  assert.equal(paths[1].slackNs, undefined);
  assert.equal(paths[2].slackNs, undefined);
  assert.ok(paths[1].totalNs > paths[2].totalNs); // 2.474 ns before 0.799 ns
});

test('hops carry kind, delay and endpoints', () => {
  const [first, second] = parseTiming(timing()).paths[0].hops;
  assert.equal(first.kind, 'clk-to-q');
  near(first.delayNs, 0.525);
  assert.equal(second.kind, 'routing');
  assert.ok(second.from.startsWith('u_aes_top.'));
});

test('with a netlist, hops get user source locations; library-only cells stay unattributed', () => {
  const { paths } = parseTiming(timing(), netlistSrcLookup(netlist()));
  const srcs = paths[0].hops.map((h) => h.src);
  assert.ok(srcs.some((s) => s?.file === CIPHER && s.line === 225));
  assert.ok(srcs.some((s) => s === undefined));
  assert.ok(srcs.every((s) => !s || !s.file.includes('/share/yosys/')));
});

test('hotspots rank user lines by delay on the worst path, split logic/routing', () => {
  const path = parseTiming(timing(), netlistSrcLookup(netlist())).paths[0];
  const [a, b] = hotspots(path);
  assert.deepEqual([a.src.file, a.src.line], [CIPHER, 225]);
  near(a.totalNs, 2.045);
  near(a.logicNs, 1.915);
  near(a.routingNs, 0.13);
  assert.deepEqual([b.src.file, b.src.line], [CORE, 181]);
  near(b.totalNs, 1.704);
  near(b.routingNs, 1.179);
  assert.ok(hotspots(path).reduce((n, h) => n + h.totalNs, 0) <= path.totalNs + 1e-9);
});

test('without a netlist: no attribution, no hotspots', () => {
  const path = parseTiming(timing()).paths[0];
  assert.ok(path.hops.every((h) => h.src === undefined));
  assert.deepEqual(hotspots(path), []);
});

test('pickUserSrc skips tool-library entries, parses file/line/col, tolerates junk', () => {
  assert.deepEqual(pickUserSrc('/p/a.sv:225.30-225.84|/t/share/yosys/ecp5/arith_map.v:74.7-80.4'), { file: '/p/a.sv', line: 225, col: 30 });
  assert.deepEqual(pickUserSrc('/p/b.v:7'), { file: '/p/b.v', line: 7, col: 1 });
  assert.equal(pickUserSrc('/t/share/yosys/ecp5/cells_map.v:16.1-16.9'), undefined);
  assert.equal(pickUserSrc(undefined), undefined);
  assert.equal(pickUserSrc(''), undefined);
});

test('netlistSrcLookup: known cell, unknown cell, empty/malformed netlist', () => {
  const look = netlistSrcLookup(netlist());
  assert.match(look('u_aes_top.u_core.u_aes_cipher.ctr_nxt_q_TRELLIS_FF_Q_DI_CCU2C_S0_10$CCU2_COMB0')!, /aes_cipher\.sv:225/);
  assert.equal(look('nope'), undefined);
  assert.equal(netlistSrcLookup({})('x'), undefined);
  assert.equal(netlistSrcLookup(null)('x'), undefined);
});

test('malformed timing input gives an empty report', () => {
  const empty = { clocks: [], paths: [], endpoints: [] };
  assert.deepEqual(parseTiming({}), empty);
  assert.deepEqual(parseTiming(null), empty);
  assert.deepEqual(parseTiming({ critical_paths: 'x', fmax: 3, detailed_net_timings: 'y' }), empty);
});

// ---- worst endpoints (detailed_net_timings: per-endpoint arrival times) ----
const passTiming = () => JSON.parse(fixture('timing/pass_timing.json'));
const passNetlist = () => JSON.parse(fixture('timing/pass_routed.json'));
const AESDIR = '/Users/james/Workspace/AES/src/';
const passReport = () => parseTiming(passTiming(), netlistSrcLookup(passNetlist()));

test('endpoints: arrival, slack against the clock period, and the endpoint register\'s source line', () => {
  const eps = passReport().endpoints;
  assert.equal(eps.length, 178);
  const top = [...eps].sort((a, b) => b.arrivalNs - a.arrivalNs)[0];
  assert.ok(top.net.endsWith('ctr_nxt_q_TRELLIS_FF_Q_DI[31]'));
  assert.ok(top.cell.endsWith('ctr_nxt_q_TRELLIS_FF_Q') && top.port === 'DI');
  near(top.arrivalNs, 3.91);
  near(top.slackNs, 4.0 - 3.91);
  assert.deepEqual(top.src, { file: AESDIR + 'aes_cipher.sv', line: 199, col: 5 });
});

test('endpoints: async-event endpoints have arrival but no slack', () => {
  const a = passReport().endpoints.find((e) => e.cell.endsWith('pass_o$tr_io'))!;
  assert.equal(a.event, '<async>');
  near(a.arrivalNs, 2.436);
  assert.equal(a.slackNs, undefined);
  assert.deepEqual(a.src, { file: '/Users/james/Workspace/AES/synth/aes_impl_top.sv', line: 66, col: 18 });
});

test('endpoints: falls back to the driver cell when the endpoint cell has no user source', () => {
  const t = { fmax: {}, critical_paths: [], detailed_net_timings: [{ net: 'n', driver: 'drv', event: 'e', endpoints: [{ cell: 'end', port: 'D', event: 'e', delay: [0, 1] }] }] };
  const src = (c: string) => (c === 'end' ? '/t/share/yosys/ecp5/cells_map.v:1.1-1.2' : '/p/a.sv:7.3-7.9');
  assert.deepEqual(parseTiming(t, src).endpoints[0].src, { file: '/p/a.sv', line: 7, col: 3 });
});

test('endpoints: none without detailed_net_timings; no source without a netlist', () => {
  assert.deepEqual(parseTiming(timing()).endpoints, []);
  assert.ok(parseTiming(passTiming()).endpoints.every((e) => e.src === undefined));
});

test('lineRows: one row per source line, worst slack first; endpoints counted; no duplicates', () => {
  const rows = lineRows([{ name: 'pass', report: passReport() }]);
  assert.equal(rows.length, 12);
  assert.equal(new Set(rows.map((r) => `${r.src.file}:${r.src.line}`)).size, 12);
  const key = (r: (typeof rows)[number]) => `${r.src.file.split('/').pop()}:${r.src.line}`;
  assert.deepEqual(rows.slice(0, 5).map(key), ['aes_cipher.sv:199', 'aes_cipher.sv:225', 'aes_round_engine.sv:173', 'aes_impl_top.sv:289', 'aes_register_file_axi_lite.sv:72']);
  const [r199, r225, r173, r289] = rows;
  near(r199.slackNs, 0.09); near(r199.arrivalNs, 3.91); assert.equal(r199.endpoints, 143);
  assert.ok(r199.worst.endsWith('ctr_nxt_q_TRELLIS_FF_Q.DI') && r199.worst.includes('ctr_nxt_q_TRELLIS_FF_Q_DI[31] → '), r199.worst);
  near(r225.slackNs, 0.09); assert.equal(r225.endpoints, 0);
  assert.match(r225.worst, /^posedge .* → posedge /); // on the critical path itself, no endpoint of its own
  near(r173.slackNs, 0.15); near(r173.arrivalNs, 3.85); assert.equal(r173.endpoints, 7);
  near(r289.slackNs, 0.378); assert.equal(r289.endpoints, 19); // slack from its endpoints, though its path has none
  const last = rows[rows.length - 1];
  assert.equal(`${last.src.file.split('/').pop()}:${last.src.line}`, 'aes_impl_top.sv:64');
  assert.equal(last.slackNs, undefined);
});

test('lineRows: failing report without endpoints gives its critical-path lines with negative slack', () => {
  const rows = lineRows([{ name: 'fail', report: parseTiming(timing(), netlistSrcLookup(netlist())) }]);
  assert.deepEqual([rows[0].src.file, rows[0].src.line, rows[0].endpoints], [CIPHER, 225, 0]);
  near(rows[0].slackNs, -2.611); near(rows[0].arrivalNs, 5.111);
  assert.ok(rows.some((r) => r.src.file === CORE && r.src.line === 181));
});

test('lineRows: limit counts lines; merges reports (endpoints add, worst slack wins)', () => {
  const good = { name: 'a', report: passReport() };
  assert.equal(lineRows([good], 3).length, 3);
  assert.deepEqual(lineRows([good], 0), []);
  const worse = { name: 'b', report: { ...good.report, endpoints: good.report.endpoints.map((e) => ({ ...e, slackNs: e.slackNs === undefined ? undefined : e.slackNs - 1 })) } };
  const merged = lineRows([good, worse]);
  assert.equal(merged.length, 12);
  assert.deepEqual([merged[0].report, merged[0].endpoints], ['b', 286]);
});

test('lineRows: nothing links to a file without a netlist; empty input is empty', () => {
  assert.deepEqual(lineRows([{ name: 'x', report: parseTiming(passTiming()) }]), []);
  assert.deepEqual(lineRows([]), []);
});
