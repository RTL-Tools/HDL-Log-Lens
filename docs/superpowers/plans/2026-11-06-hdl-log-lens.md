# HDL Log Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A VS Code extension that parses Verilator, NVC, Yosys and nextpnr log files from disk and shows their warnings/errors in the Problems panel.

**Architecture:** Pure, vscode-free modules (types, per-tool parsers, detect+dedupe, path resolution) are unit-tested with `node:test` against real AES log fixtures. One thin `extension.ts` glues them to a single `DiagnosticCollection`, a file watcher, settings, and a clear command.

**Tech Stack:** TypeScript (CommonJS, `tsc` → `out/`), `node:test`, `@types/vscode`, VS Code ≥ 1.90. No runtime dependencies. Node 26 is installed locally.

**Spec:** `docs/superpowers/specs/2026-11-06-hdl-log-lens-design.md`

## Global Constraints

- v1 tools: Verilator, NVC, Yosys, nextpnr only. No Vivado/Questa code or hand-written fixtures.
- One `DiagnosticCollection`; `Diagnostic.source` = tool name (`verilator`), `Diagnostic.code` = message ID when present.
- Dedupe within one log only; identical diagnostics from different logs are both kept.
- Location-less messages attach to the log file, line 1.
- Path resolution order: absolute → relative to the log's directory → workspace root(s) → filename search. An ambiguous or missing filename search result must NOT guess (attach to the log file).
- Re-parsing a log replaces that log's previous diagnostics.
- Default log glob `**/out/reports/**/*.log` plus `**/*.rpt`, overridable by setting.
- Severity: Error/Fatal → error, Warning → warning, Note/Info → information (nextpnr/Yosys `Info:` lines are ignored).
- Parsers take 1-based line/col; conversion to 0-based happens only in `extension.ts`.
- Only commit when the user confirms; the commit steps below assume they have.

## Review Focus

- Verilator source-context and caret lines (`   63 |`, `      |  ^~~`) and the `- V e r i l a t i o n   R e p o r t` summary must not become diagnostics.
- CRLF line endings, an empty file, and a 50 000-line log must parse correctly and in under a second.
- A Windows path (`C:\proj\a.sv:12:5:`) must not be split at the drive-letter colon.
- Two workspace files with the same basename: the filename search must not pick one arbitrarily.
- Yosys repeated warnings collapse to one; Yosys `Warning:` lines with no `at file:line` attach to the log.

## File Structure

```
package.json            manifest, settings, command, scripts
tsconfig.json
.gitignore              node_modules, out
src/types.ts            Finding, Tool, Parser
src/dedupe.ts           dedupe()
src/parsers/verilator.ts  yosys.ts  nextpnr.ts  nvc.ts   one Parser each
src/parse.ts            detectTool(), parseLog()
src/resolve.ts          resolvePath()
src/extension.ts        vscode glue (only file importing 'vscode')
test/*.test.ts          one per module
test/fixtures/<tool>/*.log   real logs copied from /Users/james/Workspace/AES/out/reports
```

---

### Task 1: Scaffold, types, dedupe

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `src/types.ts`, `src/dedupe.ts`, `test/dedupe.test.ts`

**Interfaces:**
- Produces (`src/types.ts`):
  ```ts
  export type Severity = 'error' | 'warning' | 'info';
  export type Tool = 'verilator' | 'yosys' | 'nextpnr' | 'nvc';
  export interface Finding {
    file?: string;            // undefined => attach to the log file
    line: number; col: number;            // 1-based
    endLine?: number; endCol?: number;
    severity: Severity; code?: string; message: string;
  }
  export type Parser = (text: string) => Finding[];
  ```
- Produces (`src/dedupe.ts`): `export function dedupe(f: Finding[]): Finding[]` — keeps first occurrence and order; identity key = file, line, col, endLine, endCol, severity, code, message.

- [ ] **Step 1:** Create `package.json` (name `hdl-log-lens`, `main: ./out/src/extension.js`, `engines.vscode ^1.90.0`, `activationEvents: ["onStartupFinished"]`, devDependencies `typescript`, `@types/node`, `@types/vscode`; scripts `build: tsc -p .`, `test: tsc -p . && node --test out/test/`), `tsconfig.json` (CommonJS, ES2022, strict, `outDir: out`, includes `src` and `test`), `.gitignore`. Run `npm install`.
- [ ] **Step 2:** Write `src/types.ts` as above.
- [ ] **Step 3: Failing test** `test/dedupe.test.ts`: `dedupe collapses identical findings, keeps first order` (three findings, two identical → length 2, order preserved); `dedupe keeps findings differing only by code`; `dedupe([]) → []`.
- [ ] **Step 4:** Run `npm test` → FAIL (module missing). Implement `dedupe` (Set keyed by `JSON.stringify` of the key fields). Run `npm test` → PASS.
- [ ] **Step 5:** Commit `chore: scaffold extension, types, dedupe`.

---

### Task 2: Verilator parser

**Files:**
- Create: `src/parsers/verilator.ts`, `test/verilator.test.ts`, `test/fixtures/verilator/lint.log`, `test/fixtures/verilator/sim-native-errors.log` (copy from `/Users/james/Workspace/AES/out/reports/verilator/lint.log` and `sim-native.log`)

**Interfaces:**
- Consumes: `Parser`, `Finding`.
- Produces: `export const parseVerilator: Parser`.

- [ ] **Step 1: Failing tests** (`test/verilator.test.ts`, helper `read(name)` loads fixtures):
  - `lint.log first finding`: `[0]` equals `{file:'/Users/james/Workspace/AES/src/aes_key_schedule.sv', line:115, col:29, severity:'warning', code:'WIDTHEXPAND'}` (message starts `Operator FUNCREF 'c_rcon_byte'`).
  - `lint.log yields only %Warning/%Error lines`: every finding has `file` defined and `code` defined; none has message starting with `...`, `-`, or containing `^~`.
  - `sim-native errors`: exactly 3 findings, all severity `error`; `[0].code` undefined, `[0].line` 29, `[0].col` 43; `[2].code === 'PINNOTFOUND'`, `[2].line` 62, `[2].col` 36; the `%Error: Exiting due to 3 error(s)` line is not included.
  - `windows path`: `%Warning-UNUSED: C:\proj\a.sv:12:5: Signal is not used: 'x'` → `file 'C:\\proj\\a.sv'`, line 12, col 5.
  - `location-less %Warning`: `%Warning-DEPRECATED: Something` → `file` undefined, line 1, col 1.
  - `CRLF input` parses the same as LF; `''` → `[]`.
- [ ] **Step 2:** Run → FAIL. Implement `parseVerilator`: split on `/\r?\n/`; match `^%(Error|Warning)(?:-([A-Z0-9_]+))?: (.*)$`; within the rest, try `^(.+?):(\d+):(\d+): (.*)$` for location; skip `Exiting due to`. Everything else (context lines) never matches the leading `%`.
- [ ] **Step 3:** Run → PASS. Commit `feat: verilator parser`.

---

### Task 3: Yosys parser

**Files:**
- Create: `src/parsers/yosys.ts`, `test/yosys.test.ts`, `test/fixtures/yosys/yosys.log` (copy from AES `out/reports/yosys/yosys.log`)

**Interfaces:**
- Produces: `export const parseYosys: Parser`.

- [ ] **Step 1: Failing tests:**
  - `yosys.log range`: after `dedupe(parseYosys(text))`, the findings for `/Users/james/Workspace/AES/src/sbox.sv` line 129 with message containing `m_axi.tdata` number exactly 1, with `col 11, endLine 129, endCol 62`, severity warning.
  - `yosys.log dedupe effect`: `parseYosys(text).length` > `dedupe(parseYosys(text)).length`, and the deduped length is ≤ 106 (the log's own `Warnings: 90 unique messages, 106 total` line). If it equals 90, tighten the assertion to 90.
  - `summary lines ignored`: no finding message starts with `Warnings:`.
  - Inline cases: `ERROR: Bad thing at foo.v:12.` → error, file `foo.v`, line 12; `foo.v:12: ERROR: msg` → error, file `foo.v`, line 12, message `msg`; `Warning: no location here` → file undefined, line 1.
- [ ] **Step 2:** Run → FAIL. Implement `parseYosys`: lines starting `Warning:` / `ERROR:` (case as printed) or `^(\S+?):(\d+): (ERROR|Warning): (.*)`; for the first form, extract trailing ` at <file>:<L>[.<C>][-<L2>.<C2>].` with a regex anchored at line end. Column defaults 1 when absent.
- [ ] **Step 3:** Run → PASS. Commit `feat: yosys parser`.

---

### Task 4: nextpnr parser

**Files:**
- Create: `src/parsers/nextpnr.ts`, `test/nextpnr.test.ts`, `test/fixtures/nextpnr/nextpnr.log` (copy from AES `out/reports/yosys/nextpnr.log`)

**Interfaces:**
- Produces: `export const parseNextpnr: Parser`.

- [ ] **Step 1: Failing tests:** `nextpnr.log`: exactly 4 findings, all severity warning, all `file` undefined, `[0].message` contains `rst_n_i`; the trailing `4 warnings, 0 errors` is not a finding; `ERROR: boom` → one error finding; `Info: hello` → none.
- [ ] **Step 2:** Run → FAIL. Implement `parseNextpnr`: only `^Warning: ` and `^ERROR: ` lines.
- [ ] **Step 3:** Run → PASS. Commit `feat: nextpnr parser`.

---

### Task 5: NVC parser

**Files:**
- Create: `src/parsers/nvc.ts`, `test/nvc.test.ts`, `test/fixtures/nvc/fatal-no-location.log` (copy AES `out/reports/nvc/sim-native.log`), `test/fixtures/nvc/syntax-error.log` (generated)

**Interfaces:**
- Produces: `export const parseNvc: Parser`.

- [ ] **Step 1: Generate the real fixture:** copy an AES VHDL file under `src/` to the scratchpad, break a known line (e.g. delete a `;`), run `nvc --std=2008 -a <copy>` capturing stdout+stderr to `test/fixtures/nvc/syntax-error.log`. Note the file name and line NVC reports (`> file:line`).
- [ ] **Step 2: Failing tests:** `syntax-error.log`: first finding is severity error, `file` ends with the copied file's name, `line` equals the reported line; `fatal-no-location.log`: 2 findings — a warning and an error (Fatal), both `file` undefined; inline: `** Warning: w\n    > a.vhd:7\n` → warning at `a.vhd:7`; `** Note: n` → severity info; a location line after a *later* header belongs to that later header.
- [ ] **Step 3:** Run → FAIL. Implement `parseNvc` as a small state machine: header `^\*\* (Error|Fatal|Warning|Note): (.*)` opens a pending finding; the next `^\s*> (.+?):(\d+)` line before another header sets file/line; flush on next header and at end. Column 1 (`// shortcut: col from caret line not parsed, upgrade if users want column precision`).
- [ ] **Step 4:** Run → PASS. Commit `feat: nvc parser`.

---

### Task 6: Detection and `parseLog`

**Files:**
- Create: `src/parse.ts`, `test/parse.test.ts`

**Interfaces:**
- Consumes: the four parsers, `dedupe`.
- Produces:
  ```ts
  export function detectTool(logPath: string, text: string): Tool | undefined
  export function parseLog(logPath: string, text: string, override?: Tool): { tool: Tool; findings: Finding[] } | undefined
  ```
  Detection order: tool name in the path (`verilator|nvc|yosys|nextpnr`, case-insensitive; `nextpnr` checked before `yosys` because AES keeps `nextpnr.log` under `yosys/`) → content: `^%(Warning|Error)` verilator; `^\*\* (Error|Warning|Fatal|Note):` nvc; `Yosys \d` yosys; `nextpnr-` nextpnr → else `undefined`. `parseLog` returns `undefined` when no tool is detected and no override, otherwise `{tool, findings: dedupe(parser(text))}`.

- [ ] **Step 1: Failing tests:** `.../yosys/nextpnr.log` → `nextpnr` (path wins over dir name); `impl/aes_impl_top_ecp5_synth.log` with fixture text `yosys.log` → `yosys` via banner; `verilator/lint.log` → `verilator`; `random.log` with `** Error: x` → `nvc`; unknown text → `undefined`; override beats detection; `parseLog` on the yosys fixture is deduped (shorter than raw).
- [ ] **Step 2:** Run → FAIL; implement; run → PASS.
- [ ] **Step 3: Performance/robustness tests** (Review Focus): synthetic 50 000-line Verilator log parses in < 1000 ms; empty string → `[]` for each parser via `parseLog` with override; CRLF yosys input parses identically to LF.
- [ ] **Step 4:** Commit `feat: tool detection and parseLog`.

---

### Task 7: Path resolution

**Files:**
- Create: `src/resolve.ts`, `test/resolve.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function resolvePath(
    file: string, logDir: string, roots: string[],
    searchByName: (basename: string) => string[],
  ): string | undefined
  ```
  Order: absolute (exists) → `logDir/file` (exists) → each `root/file` (exists) → `searchByName(basename(file))` but only if it returns exactly one candidate. Uses `fs.existsSync`. Returns `undefined` otherwise.

- [ ] **Step 1: Failing tests** (temp dirs from `fs.mkdtempSync`): absolute existing → itself; relative to log dir; relative to a root; basename search with 1 hit → that hit; **2 hits → `undefined`** (no guessing); 0 hits → `undefined`; a nonexistent absolute path falls through to basename search.
- [ ] **Step 2:** Run → FAIL; implement; run → PASS. Commit `feat: path resolution`.

---

### Task 8: VS Code glue

**Files:**
- Create: `src/extension.ts`
- Modify: `package.json` (add `contributes.configuration`, `contributes.commands`)

**Interfaces:**
- Consumes: `parseLog`, `resolvePath`, `Finding`.
- Settings: `hdlLogLens.logGlobs: string[]` (default `["**/out/reports/**/*.log", "**/*.rpt"]`), `hdlLogLens.tool: "auto"|"verilator"|"yosys"|"nextpnr"|"nvc"` (default `auto`), `hdlLogLens.suppressCodes: string[]` (default `[]`). Command `hdlLogLens.clear` titled "HDL Log Lens: Clear HDL problems".

- [ ] **Step 1:** Implement `activate(ctx)`: create one `DiagnosticCollection('hdl-log-lens')`; keep `Map<logFsPath, Map<uriString, vscode.Diagnostic[]>>` (one entry per log). `refreshLog(uri)`: read file, `parseLog`, drop findings whose `code` is in `suppressCodes`, resolve each `finding.file` with `resolvePath` (filename search backed by a `findFiles('**/*.{v,vh,sv,svh,vhd,vhdl}', '**/{node_modules,.venv,.bender,out}/**')` index of basename → paths); unresolved or location-less findings attach to the log file at line 0. Convert to 0-based `Range` (`endLine/endCol` when present, else the whole line via `Number.MAX_SAFE_INTEGER`-free approach: end col = start col + 1). Set `source = tool`, `code`, severity map. Then rebuild the collection from the map (`clear()` + `set` per URI). `deleteLog(uri)` removes the entry and rebuilds.
- [ ] **Step 2:** Initial scan via `workspace.findFiles` for each glob in `logGlobs`; `createFileSystemWatcher` per glob wired to `refreshLog` (create/change) and `deleteLog`; re-scan when `hdlLogLens.*` configuration changes; register `hdlLogLens.clear` (clears map and collection); push all disposables to `ctx.subscriptions`.
- [ ] **Step 3:** Run `npm run build` → no type errors; `npm test` still PASS.
- [ ] **Step 4: Manual verification** (the `code` CLI is not on PATH in the dev environment, so launch from the VS Code UI: open this folder, F5 "Run Extension", open `/Users/james/Workspace/AES` in the Extension Development Host). Expected: Problems panel lists Verilator lint warnings from `out/reports/verilator/lint.log` with source `verilator` and codes like `UNUSEDSIGNAL`; clicking one jumps to the line in `src/`; Yosys `sbox.sv:129` appears once per Yosys log; nextpnr warnings sit under `nextpnr.log`; "HDL Log Lens: Clear HDL problems" empties the panel; re-running `make lint-sv` updates the panel without duplication. Record what was and wasn't observed.
- [ ] **Step 5:** Add a short `README.md` (what it does, settings, supported tools, Vivado/Questa as future work). Commit `feat: VS Code extension glue and README`.

---

## Self-Review

- **Spec coverage:** parsers ×4 (T2–5); glob + watcher + re-parse replace (T8); auto-detect + override (T6, T8); path order (T7); dedupe (T1, T6); location-less → log (T2,3,4,5,8); source/code (T8); clear command + suppress IDs (T8); AES fixtures (T2–5); Vivado/Questa, sidebar, GHDL are non-goals (not planned).
- **Known limits carried from spec:** no clear-on-edit; Windows/WSL beyond the drive-letter case is best-effort; NVC column not parsed.
- **Types:** `Finding`, `Parser`, `Tool`, `parseLog`, `resolvePath`, `dedupe` names are used identically across tasks.
