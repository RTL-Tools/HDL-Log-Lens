import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePath } from '../src/resolve';

const mk = () => {
  const base = mkdtempSync(join(tmpdir(), 'lens-'));
  const logDir = join(base, 'out', 'logs');
  const root = join(base, 'ws');
  mkdirSync(logDir, { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  return { base, logDir, root };
};
const touch = (p: string) => writeFileSync(p, '');
const none = () => [];

test('absolute existing path resolves to itself', () => {
  const { root, logDir } = mk();
  touch(join(root, 'src', 'a.sv'));
  assert.equal(resolvePath(join(root, 'src', 'a.sv'), logDir, [root], none), join(root, 'src', 'a.sv'));
});

test('relative to the log directory', () => {
  const { logDir, root } = mk();
  touch(join(logDir, 'b.vhd'));
  assert.equal(resolvePath('b.vhd', logDir, [root], none), join(logDir, 'b.vhd'));
});

test('relative to a workspace root', () => {
  const { logDir, root } = mk();
  touch(join(root, 'src', 'c.sv'));
  assert.equal(resolvePath('src/c.sv', logDir, [root], none), join(root, 'src', 'c.sv'));
});

test('filename search with exactly one hit resolves', () => {
  const { logDir, root } = mk();
  const hit = join(root, 'src', 'd.sv');
  touch(hit);
  assert.equal(resolvePath('d.sv', logDir, [root], (n) => (n === 'd.sv' ? [hit] : [])), hit);
});

test('filename search with two hits does not guess', () => {
  const { logDir, root } = mk();
  assert.equal(resolvePath('e.sv', logDir, [root], () => ['/x/e.sv', '/y/e.sv']), undefined);
});

test('no hits gives undefined; missing absolute path falls through to search by name', () => {
  const { logDir, root } = mk();
  assert.equal(resolvePath('f.sv', logDir, [root], none), undefined);
  const hit = join(root, 'src', 'g.sv');
  touch(hit);
  assert.equal(resolvePath('/gone/elsewhere/g.sv', logDir, [root], (n) => (n === 'g.sv' ? [hit] : [])), hit);
});

test('windows-style path searches by its last segment', () => {
  const { logDir, root } = mk();
  const hit = join(root, 'src', 'h.sv');
  assert.equal(resolvePath('C:\\proj\\h.sv', logDir, [root], (n) => (n === 'h.sv' ? [hit] : [])), hit);
});
