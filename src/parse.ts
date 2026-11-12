import { basename, dirname } from 'node:path';
import { dedupe } from './dedupe';
import { parseNextpnr } from './parsers/nextpnr';
import { parseNvc } from './parsers/nvc';
import { parseQuesta } from './parsers/questa';
import { parseVerilator } from './parsers/verilator';
import { parseVivado } from './parsers/vivado';
import { parseYosys } from './parsers/yosys';
import type { Finding, Parser, Tool } from './types';

const PARSERS: Record<Tool, Parser> = {
  verilator: parseVerilator, yosys: parseYosys, nextpnr: parseNextpnr, nvc: parseNvc, vivado: parseVivado, questa: parseQuesta,
};

// nextpnr is listed before yosys: AES keeps nextpnr.log inside a yosys/ folder.
const BY_NAME: [RegExp, Tool][] = [
  [/nextpnr/i, 'nextpnr'], [/yosys/i, 'yosys'], [/verilator/i, 'verilator'], [/nvc/i, 'nvc'],
  [/vivado|xvlog|xvhdl|xelab/i, 'vivado'], [/questa|^(transcript|v(sim|log|com)\b)/i, 'questa'],
];
const BY_CONTENT: [RegExp, Tool][] = [
  [/^%(Warning|Error)/m, 'verilator'],
  [/\((?:vsim|vlog|vcom|vopt)-\w+\)/, 'questa'], // before nvc: both print "** Error:"
  [/^(WARNING|CRITICAL WARNING|ERROR): \[[A-Za-z_]+ [\d-]+\]/m, 'vivado'],
  [/^\| Tool Version : Vivado/m, 'vivado'],
  [/^\*\* (Error|Warning|Fatal|Note):/m, 'nvc'],
  [/^\s*Yosys \d/m, 'yosys'],
  [/nextpnr-/, 'nextpnr'],
];

export function detectTool(logPath: string, text: string): Tool | undefined {
  // Only the file name and its parent folder: higher path parts are workspace names, not tools.
  for (const part of [basename(logPath), basename(dirname(logPath))]) {
    for (const [re, tool] of BY_NAME) if (re.test(part)) return tool;
  }
  for (const [re, tool] of BY_CONTENT) if (re.test(text)) return tool;
  return undefined;
}

export function parseLog(
  logPath: string, text: string, override?: Tool,
): { tool: Tool; findings: Finding[] } | undefined {
  const tool = override ?? detectTool(logPath, text);
  return tool && { tool, findings: dedupe(PARSERS[tool](text)) };
}
