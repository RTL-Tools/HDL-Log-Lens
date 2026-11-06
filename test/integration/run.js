// Usage: AES_DIR=/path/to/AES [VSCODE_BIN=...] npm run test:integration
// Runs the app binary directly: the `code` launcher script returns before the host finishes.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const aes = process.env.AES_DIR;
if (!aes) { console.error('Set AES_DIR to a checkout of the AES project with out/reports logs.'); process.exit(2); }
const root = path.resolve(__dirname, '../..');
// VS Code's IPC socket path must stay under ~103 chars, so avoid long TMPDIRs.
const base = os.tmpdir().length > 40 ? '/tmp' : os.tmpdir();
const tmp = fs.mkdtempSync(path.join(base, 'lens-'));
const result = path.join(tmp, 'result.txt');
const bin = process.env.VSCODE_BIN || '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
spawnSync(bin, [
  `--extensionDevelopmentPath=${root}`,
  `--extensionTestsPath=${path.join(root, 'out/test/integration/index.js')}`,
  `--user-data-dir=${path.join(tmp, 'u')}`, `--extensions-dir=${path.join(tmp, 'e')}`,
  '--disable-workspace-trust', '--disable-extensions', aes,
], { env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, HDL_LENS_RESULT: result }, stdio: 'inherit' }); // RUN_AS_NODE makes Electron reject VS Code flags
const text = fs.existsSync(result) ? fs.readFileSync(result, 'utf8') : 'FAIL no result written (host did not run the test)\n';
fs.rmSync(tmp, { recursive: true, force: true });
console.log(text);
process.exit(text.startsWith('PASS') ? 0 : 1);
