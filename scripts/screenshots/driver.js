// Usage: AES_DIR=/path/to/AES node scripts/screenshots/driver.js   (macOS app path; VSCODE_BIN overrides)
// Launches VS Code with the extension on AES, drives scripts/screenshots/steps.js, and saves each step's screenshot
// to docs/images/<step>.png through the Chrome DevTools protocol (captures only the VS Code window).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const aes = process.env.AES_DIR;
if (!aes) { console.error('Set AES_DIR to a checkout of the AES project with out/reports logs.'); process.exit(2); }
const root = path.resolve(__dirname, '../..');
const bin = process.env.VSCODE_BIN || '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const port = 9300 + Math.floor(Math.random() * 500);
const tmp = fs.mkdtempSync(path.join(os.tmpdir().length > 40 ? '/tmp' : os.tmpdir(), 'lens-shot-')); // short: IPC socket limit
const shots = path.join(tmp, 'shots');
fs.mkdirSync(shots);
fs.mkdirSync(path.join(tmp, 'u/User'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'u/User/settings.json'), JSON.stringify({
  'workbench.colorTheme': 'Default Dark Modern', 'workbench.startupEditor': 'none', 'editor.minimap.enabled': false,
  'window.commandCenter': false, 'chat.disableAIFeatures': true, 'telemetry.telemetryLevel': 'off', 'update.mode': 'none',
  'workbench.tips.enabled': false, 'window.restoreWindows': 'none', 'workbench.layoutControl.enabled': false,
  'editor.fontSize': 13, 'workbench.secondarySideBar.defaultVisibility': 'hidden', 'breadcrumbs.enabled': false,
  'git.enabled': false, 'workbench.activityBar.location': 'hidden', 'extensions.autoCheckUpdates': false, 'extensions.ignoreRecommendations': true,
}, null, 2));

const child = spawn(bin, [
  `--extensionDevelopmentPath=${root}`, `--extensionTestsPath=${path.join(__dirname, 'steps.js')}`,
  `--user-data-dir=${path.join(tmp, 'u')}`, `--extensions-dir=${path.join(tmp, 'e')}`,
  // No --disable-extensions: the fresh --extensions-dir already means no other extensions, and that flag shows a notice.
  '--disable-workspace-trust', '--skip-release-notes', `--remote-debugging-port=${port}`, aes,
], { env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, SHOT_DIR: shots }, stdio: process.env.SHOT_DEBUG ? 'inherit' : 'ignore' });

async function pageSocket() {
  for (let i = 0; i < 150; i++) {
    try {
      const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page' && /workbench/.test(x.url));
      if (t) return new WebSocket(t.webSocketDebuggerUrl);
    } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error('VS Code debugging port never came up');
}

(async () => {
  const ws = await pageSocket();
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); });
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  fs.mkdirSync(path.join(root, 'docs/images'), { recursive: true });
  try {
    for (const name of ['log-lens-table', 'timing-table', 'inline-slack', 'inline-problems', 'inline-both', 'waive-quick-fix']) {
      for (let i = 0; i < 600 && !fs.existsSync(path.join(shots, `${name}.ready`)); i++) await sleep(100);
      if (!fs.existsSync(path.join(shots, `${name}.ready`))) throw new Error(`step ${name} never became ready`);
      // Drop the title bar ("[Extension Development Host] ...") and scale down: full retina PNGs are ~700 KB each.
      const m = (await send('Page.getLayoutMetrics')).result.cssVisualViewport;
      const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 34, width: m.clientWidth, height: m.clientHeight - 34, scale: 0.75 } });
      fs.writeFileSync(path.join(root, 'docs/images', `${name}.png`), Buffer.from(r.result.data, 'base64'));
      console.log('saved', `docs/images/${name}.png`);
      fs.writeFileSync(path.join(shots, `${name}.done`), '');
    }
  } finally {
    ws.close();
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e.message); child.kill(); process.exit(1); });
