export interface SrcLoc { file: string; line: number; col: number } // 1-based
export interface Hop { kind: string; delayNs: number; from: string; to: string; net?: string; src?: SrcLoc }
export interface PathReport { from: string; to: string; totalNs: number; slackNs?: number; hops: Hop[] }
export interface ClockReport { clock: string; achievedMHz: number; constraintMHz: number; slackNs: number }
// One register/port input from detailed_net_timings. `arrivalNs` is the report's max arrival time at it.
export interface Endpoint { net: string; driver: string; cell: string; port: string; event: string; arrivalNs: number; slackNs?: number; src?: SrcLoc }
export interface TimingReport { clocks: ClockReport[]; paths: PathReport[]; endpoints: Endpoint[] } // paths worst-first
export interface Hotspot { src: SrcLoc; totalNs: number; logicNs: number; routingNs: number }
export type SrcLookup = (cell: string) => string | undefined;

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Yosys `src` is `file:L.C-L.C|file:L.C-L.C...`, innermost first. Entries from the tool's own
// libraries (cells_map.v, arith_map.v...) are not the user's code; take the first one that is.
export function pickUserSrc(raw: string | undefined): SrcLoc | undefined {
  for (const part of (raw ?? '').split('|')) {
    if (!part || part.includes('/share/yosys/')) continue;
    const m = /^(.*?):(\d+)(?:\.(\d+))?/.exec(part);
    if (m) return { file: m[1], line: +m[2], col: m[3] ? +m[3] : 1 };
  }
  return undefined;
}

// Cell name -> raw `src` attribute, from a nextpnr `--write` routed netlist (Yosys JSON).
export function netlistSrcLookup(netlist: unknown): SrcLookup {
  const mods = isObj(netlist) && isObj(netlist.modules) ? Object.values(netlist.modules).filter(isObj) : [];
  const top = mods.find((m) => isObj(m.attributes) && 'top' in m.attributes) ?? mods[0];
  const cells = isObj(top?.cells) ? top.cells : {};
  return (cell) => {
    const src = cells[cell]?.attributes?.src;
    return typeof src === 'string' ? src : undefined;
  };
}

export function parseTiming(timing: unknown, srcOf?: SrcLookup): TimingReport {
  if (!isObj(timing)) return { clocks: [], paths: [], endpoints: [] };
  const fmax = isObj(timing.fmax) ? timing.fmax : {};
  const clocks: ClockReport[] = Object.entries(fmax)
    .filter(([, v]) => isObj(v) && typeof v.achieved === 'number' && typeof v.constraint === 'number')
    .map(([clock, v]) => ({
      clock, achievedMHz: v.achieved, constraintMHz: v.constraint,
      slackNs: 1000 / v.constraint - 1000 / v.achieved,
    }));

  const paths: PathReport[] = (Array.isArray(timing.critical_paths) ? timing.critical_paths : [])
    .filter((p: unknown) => isObj(p) && Array.isArray(p.path))
    .map((p: Record<string, any>) => {
      const hops: Hop[] = p.path.map((h: Record<string, any>) => {
        const cell = h.from?.cell ?? h.to?.cell;
        return {
          kind: String(h.type), delayNs: Number(h.delay), from: String(h.from?.cell ?? ''), to: String(h.to?.cell ?? ''),
          net: typeof h.net === 'string' ? h.net : undefined,
          src: srcOf && cell ? pickUserSrc(srcOf(cell)) : undefined,
        };
      });
      const totalNs = hops.reduce((n, h) => n + h.delayNs, 0);
      // Slack only for a same-clock path: both ends name the same clock, whose period is the budget.
      const clk = clocks.find((c) => p.from === `posedge ${c.clock}` && p.to === `posedge ${c.clock}`);
      return { from: String(p.from), to: String(p.to), totalNs, slackNs: clk ? 1000 / clk.constraintMHz - totalNs : undefined, hops };
    });

  paths.sort((a, b) => (a.slackNs === undefined ? 1 : 0) - (b.slackNs === undefined ? 1 : 0)
    || (a.slackNs ?? 0) - (b.slackNs ?? 0) || b.totalNs - a.totalNs);

  // Endpoint source: the register itself carries the always_ff block's line; the driving cell is usually a library LUT.
  const endpoints: Endpoint[] = (Array.isArray(timing.detailed_net_timings) ? timing.detailed_net_timings : [])
    .filter(isObj)
    .flatMap((n: Record<string, any>) => (Array.isArray(n.endpoints) ? n.endpoints : [])
      .filter((e: unknown) => isObj(e) && Array.isArray(e.delay) && typeof e.delay[1] === 'number')
      .map((e: Record<string, any>): Endpoint => {
        const clk = clocks.find((c) => e.event === `posedge ${c.clock}`);
        return {
          net: String(n.net), driver: String(n.driver), cell: String(e.cell), port: String(e.port), event: String(e.event),
          arrivalNs: e.delay[1], slackNs: clk ? 1000 / clk.constraintMHz - e.delay[1] : undefined,
          src: srcOf ? pickUserSrc(srcOf(String(e.cell))) ?? pickUserSrc(srcOf(String(n.driver))) : undefined,
        };
      }));
  return { clocks, paths, endpoints };
}

export function hotspots(path: PathReport): Hotspot[] {
  const by = new Map<string, Hotspot>();
  for (const h of path.hops) {
    if (!h.src) continue;
    const key = `${h.src.file}:${h.src.line}`;
    const e = by.get(key) ?? { src: h.src, totalNs: 0, logicNs: 0, routingNs: 0 };
    e.totalNs += h.delayNs;
    if (h.kind === 'logic') e.logicNs += h.delayNs;
    if (h.kind === 'routing') e.routingNs += h.delayNs;
    by.set(key, e);
  }
  return [...by.values()].sort((a, b) => b.totalNs - a.totalNs);
}

// One table row per source line: the worst slack of any path or endpoint through it.
export interface LineRow {
  src: SrcLoc;
  slackNs?: number; // of the worst path/endpoint on the line; undefined when only unconstrained (async) paths touch it
  arrivalNs: number; // arrival time of that worst path/endpoint
  endpoints: number; // register inputs ending on this line
  worst: string; // "net → cell.port" for an endpoint, "from → to" for a critical path
  report: string;
}

interface Candidate { row: LineRow; endpoint: boolean }

// Slack compared to the picosecond: a path's summed hops and an endpoint's reported arrival differ by float noise.
const ps = (n: number) => Math.round(n * 1000);
const cmpCand = (a: Candidate, b: Candidate) =>
  (a.row.slackNs === undefined ? 1 : 0) - (b.row.slackNs === undefined ? 1 : 0)
  || ps(a.row.slackNs ?? 0) - ps(b.row.slackNs ?? 0) || b.row.arrivalNs - a.row.arrivalNs || (a.endpoint ? 0 : 1) - (b.endpoint ? 0 : 1);

// Only what traces to a user source line. Candidates are every file-linked endpoint plus every line of a critical
// path (delay > 0); each line keeps its worst candidate. Worst slack first, ties by file then line; unconstrained last.
export function lineRows(reports: { name: string; report: TimingReport }[], limit = 200): LineRow[] {
  const cands: Candidate[] = reports.flatMap(({ name, report }) => [
    ...report.paths.flatMap((p) => hotspots(p).filter((h) => h.totalNs > 0).map((h): Candidate => ({
      endpoint: false, row: { src: h.src, slackNs: p.slackNs, arrivalNs: p.totalNs, endpoints: 0, worst: `${p.from} → ${p.to}`, report: name },
    }))),
    ...report.endpoints.flatMap((e): Candidate[] => e.src
      ? [{ endpoint: true, row: { src: e.src, slackNs: e.slackNs, arrivalNs: e.arrivalNs, endpoints: 1, worst: `${e.net} → ${e.cell}.${e.port}`, report: name } }]
      : []),
  ]);
  const byLine = new Map<string, { best: Candidate; endpoints: number }>();
  for (const c of cands) {
    const key = `${c.row.src.file}:${c.row.src.line}`;
    const cur = byLine.get(key);
    byLine.set(key, { best: !cur || cmpCand(c, cur.best) < 0 ? c : cur.best, endpoints: (cur?.endpoints ?? 0) + c.row.endpoints });
  }
  return [...byLine.values()]
    .map(({ best, endpoints }) => ({ best, row: { ...best.row, endpoints } }))
    .sort((a, b) => cmpCand(a.best, b.best) || a.row.src.file.localeCompare(b.row.src.file) || a.row.src.line - b.row.src.line)
    .slice(0, limit)
    .map((x) => x.row);
}
