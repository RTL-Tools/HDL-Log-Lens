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

## Log Lens table

![The Log Lens tab: every problem from the logs as a sortable, filterable table](docs/images/log-lens-table.png)

A **Log Lens** tab in the bottom panel (next to Problems and Timing) lists every problem as a table: **Severity**, **Message**, **Code**, **Source** (`file:line`), **Tool** and **Log**. Errors come first, then by file and line. Click a column header to re-sort, type in the filter box to narrow the rows, click a row (or press Enter) to open the line. Sort and filter survive refreshes. The tab title shows the problem and waived counts. The same problems are also in VS Code's own Problems panel.

## Waivers

![Quick fix in the editor offering to waive a message or a whole message type](docs/images/waive-quick-fix.png)

Hide messages you've reviewed and accepted. Waivers live in `hdl-log-lens.waivers.json` in your first workspace folder (setting `hdlLogLens.waiverFile`), so they can be committed and reviewed:

```json
{ "waivers": [
  { "tool": "verilator", "code": "UNUSEDSIGNAL", "reason": "spare bus bits" },
  { "tool": "yosys", "file": "src/sbox.sv", "message": "wire '\\m_axi.tdata' is assigned in a block", "reason": "AXI-S interface" }
] }
```

A waiver hides every message that matches **all** the fields it lists (`tool`, `code`, `file` relative to the workspace, `message` text); there are no line numbers, so waivers survive edits. A waiver must list at least one field.

- **Right-click** a row in the Log Lens table: *Waive this message* (tool + code + file + text) or *Waive all messages of this type* (tool + code; tool + text when the tool gives no code).
- **Quick fix** (lightbulb, or Cmd+.) on a problem in the editor does the same. VS Code gives extensions no right-click menu on its own Problems panel.
- You're asked for an optional reason, which is saved in the file. To undo, delete the entry (or **HDL Log Lens: Open waiver file**).
- Waived messages are hidden, counted in the Log Lens tab title and listed in the HDL Log Lens Output channel. An invalid waiver file waives nothing and is never overwritten.

## Timing table

![The Timing tab: one row per source line, worst slack first](docs/images/timing-table.png)

A **Timing** tab in the bottom panel (next to Problems) lists the source lines that limit your timing, **one row per line**, worst slack first. It reads nextpnr timing reports (`hdlLogLens.timingGlobs`, default `**/out/reports/**/*_timing.json`, from `nextpnr --report --detailed-timing-report`) and needs the sibling `<name>_routed.json` (`nextpnr --write`), whose cells carry the HDL line they came from.

Columns: **Source** (`file:line`), **Slack** (of the worst path or register input through the line: clock period minus its arrival time), **Arrival**, **Endpoints** (register inputs ending on the line; a whole bus collapses into one row), **Worst endpoint / path**, **Report**. Click a column header to re-sort; click a row (or press Enter) to open the line. `hdlLogLens.worstLines` (default 200) caps the number of lines.

A register's source line is usually the start of its `always_ff` block. Lines are included only if they trace to your code, so delay in tool-library cells and endpoints with no source line are left out. Lines touched only by unconstrained (async) paths have no slack. There is no TNS: nextpnr doesn't report it.

## Inline timing

![An end-of-line note on the always_ff line showing its slack and endpoint count](docs/images/inline-slack.png)

Lines that appear in the timing table also get a faded note at the end of the line in the editor, like a blame annotation: `slack +0.09 ns · 616 endpoints` (red when slack is negative). Hover it for the worst endpoint and its arrival time. Toggle with **HDL Log Lens: Toggle inline timing** or `hdlLogLens.inlineTiming`. The note matches the editor's file by exact path and is not moved when you edit the file, so it can go stale until the next report.

## Settings & commands

| | |
|---|---|
| `hdlLogLens.logGlobs` | log/report globs to parse |
| `hdlLogLens.tool` | `auto` or force one parser |
| `hdlLogLens.suppressCodes` | message IDs to hide everywhere |
| `hdlLogLens.waiverFile` | waiver file path (default `hdl-log-lens.waivers.json`) |
| `hdlLogLens.worstLines` | how many source lines the Timing table lists (default 200) |
| `hdlLogLens.timingGlobs` | nextpnr timing reports for the Timing view |
| `hdlLogLens.inlineTiming` | show delay/slack at the end of timing-critical lines (default on) |
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

The screenshots in `docs/images` are real VS Code captures of the extension running on AES; regenerate them with `AES_DIR=/path/to/AES node scripts/screenshots/driver.js` (macOS; a VS Code window opens for about 30 seconds).
