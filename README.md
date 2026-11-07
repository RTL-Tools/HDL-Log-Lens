# HDL-Log-Lens

Turn HDL tool logs into clickable VS Code problems — NVC, Verilator, Yosys, nextpnr, Vivado, Questa.

_Currently implemented: Verilator, NVC, Yosys, nextpnr. Vivado and Questa are next._

VS Code extension that reads HDL tool logs from disk and shows their warnings and errors in the **Problems panel**: filter by file or severity, click to jump to the source line.

Supported tools: **Verilator, NVC, Yosys, nextpnr**. Vivado and Questa will be added once they can be tested against real logs.

## How it works

- Finds logs with `hdlLogLens.logGlobs` (default `**/out/reports/**/*.log`, `**/*.rpt`) and re-parses a log whenever it changes, replacing that log's previous problems.
- Detects the tool from the log's file name / parent folder, then its contents (override with `hdlLogLens.tool`).
- Resolves source paths: absolute → relative to the log → workspace root → unique filename match. If no single file matches, the problem is attached to the log itself with the original `file:line` in the message.
- Identical problems within one log appear once (Yosys repeats warnings). Problems from different logs are kept separate.
- `source` is the tool name, `code` the tool's message ID (e.g. `UNUSEDSIGNAL`).
- nextpnr messages have no location, so they attach to the log file.

## Sidebar

The **HDL Log Lens** Activity Bar icon shows the same problems as a tree you can regroup (tool, log, file, severity, message ID). Entries sort by severity, then file, then line; click one to open the source line.

## Timing table

A **Timing** tab in the bottom panel (next to Problems) lists the source lines that limit your timing, **one row per line**, worst slack first. It reads nextpnr timing reports (`hdlLogLens.timingGlobs`, default `**/out/reports/**/*_timing.json`, from `nextpnr --report --detailed-timing-report`) and needs the sibling `<name>_routed.json` (`nextpnr --write`), whose cells carry the HDL line they came from.

Columns: **Source** (`file:line`), **Slack** (of the worst path or register input through the line: clock period minus its arrival time), **Arrival**, **Endpoints** (register inputs ending on the line; a whole bus collapses into one row), **Worst endpoint / path**, **Report**. Click a column header to re-sort; click a row (or press Enter) to open the line. `hdlLogLens.worstLines` (default 200) caps the number of lines.

A register's source line is usually the start of its `always_ff` block. Lines are included only if they trace to your code, so delay in tool-library cells and endpoints with no source line are left out. Lines touched only by unconstrained (async) paths have no slack. There is no TNS: nextpnr doesn't report it.

## Settings & commands

| | |
|---|---|
| `hdlLogLens.logGlobs` | log/report globs to parse |
| `hdlLogLens.tool` | `auto` or force one parser |
| `hdlLogLens.suppressCodes` | message IDs to hide |
| `hdlLogLens.worstLines` | how many source lines the Timing table lists (default 200) |
| `hdlLogLens.timingGlobs` | nextpnr timing reports for the Timing view |
| `hdlLogLens.inlineTiming` | show delay/slack at the end of timing-critical lines (default on) |
| `hdlLogLens.groupBy` | sidebar grouping: `tool`, `log`, `file`, `severity` or `code` |
| **HDL Log Lens: Group problems by…** | pick the sidebar grouping (also the list icon in the sidebar title) |
| **HDL Log Lens: Clear HDL problems** | empties the panel until a log changes again |

## Known limits

- Problems don't move or clear when you edit the source; they refresh when the log is next written.
- Windows/WSL paths are handled only for drive-letter paths in Verilator logs and filename search.
- NVC parsing is tested on compile errors and a fatal; NVC *runtime* simulation messages (assertions etc.) are not yet tested against real logs.

## Development

```
npm install
npm test                                   # unit tests, real AES log fixtures
AES_DIR=/path/to/AES npm run test:integration   # runs in a real VS Code host (macOS app path; set VSCODE_BIN elsewhere)
```
Fixtures in `test/fixtures` come from the AES project's `out/reports`.
