export interface Waiver { tool?: string; code?: string; file?: string; message?: string; reason?: string }
// What a diagnostic looks like to the waiver rules. `file` is workspace-relative (see waiverFileKey); no line: lines drift.
export interface WaiverTarget { tool: string; code?: string; file: string; message: string }

const MATCH_KEYS = ['tool', 'code', 'file', 'message'] as const;
const KEYS = [...MATCH_KEYS, 'reason'] as const;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseWaivers(text: string): Waiver[] {
  if (!text.trim()) return [];
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (e) {
    throw new Error(`Waiver file is not valid JSON: ${(e as Error).message}`);
  }
  if (!isObj(root)) throw new Error('Waiver file must be a JSON object with a "waivers" array');
  if (root.waivers === undefined) return [];
  if (!Array.isArray(root.waivers)) throw new Error('"waivers" must be an array');
  return root.waivers.map((w, i) => {
    if (!isObj(w)) throw new Error(`Waiver #${i + 1} must be an object`);
    const out: Waiver = {};
    for (const k of KEYS) {
      if (w[k] === undefined) continue;
      if (typeof w[k] !== 'string') throw new Error(`Waiver #${i + 1}: "${k}" must be a string`);
      if (w[k]) out[k] = w[k] as string;
    }
    // A waiver with no match field would waive every message.
    if (!MATCH_KEYS.some((k) => out[k])) throw new Error(`Waiver #${i + 1} needs at least one of tool, code, file, message`);
    return out;
  });
}

export const isWaived = (waivers: Waiver[], t: WaiverTarget): boolean =>
  waivers.some((w) => MATCH_KEYS.every((k) => w[k] === undefined || w[k] === t[k]));

export function waiverFor(kind: 'message' | 'type', t: WaiverTarget): Waiver {
  if (kind === 'message') return { tool: t.tool, ...(t.code ? { code: t.code } : {}), file: t.file, message: t.message };
  return t.code ? { tool: t.tool, code: t.code } : { tool: t.tool, message: t.message };
}

// Edits the raw JSON so anything else in the file (extra keys, comments-as-fields) survives. Throws on an invalid file.
export function addWaiver(text: string | undefined, w: Waiver): string {
  const existing = parseWaivers(text ?? '');
  const same = (a: Waiver) => MATCH_KEYS.every((k) => a[k] === w[k]);
  if (text !== undefined && existing.some(same)) return text;
  const root: Record<string, unknown> = text?.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
  root.waivers = [...(Array.isArray(root.waivers) ? root.waivers : []), w];
  return `${JSON.stringify(root, null, 2)}\n`;
}

// Workspace-relative posix path, or the path as given when it is outside every workspace folder.
export function waiverFileKey(fsPath: string, roots: string[]): string {
  const root = roots.find((r) => fsPath.startsWith(`${r}/`));
  return root ? fsPath.slice(root.length + 1) : fsPath;
}
