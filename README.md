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

## Settings & command

| | |
|---|---|
| `hdlLogLens.logGlobs` | log/report globs to parse |
| `hdlLogLens.tool` | `auto` or force one parser |
| `hdlLogLens.suppressCodes` | message IDs to hide |
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
