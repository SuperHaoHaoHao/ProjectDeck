import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { detect, detectDependencies } from '../../src/server/detect.js';
import { FIXTURES } from '../helpers/deck.js';

const tempDirs: string[] = [];

function fixtureCopy(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `projectdeck-${name}-`));
  fs.cpSync(path.join(FIXTURES, name), dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

describe('detect', () => {
  after(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('finds a node service and its dev script', () => {
    const detection = detect(path.join(FIXTURES, 'service'));
    assert.ok(detection);
    assert.equal(detection.kind, 'service');
    assert.equal(detection.runtime, 'node');
    assert.equal(detection.entry?.cmd, 'npm');
    assert.deepEqual(detection.entry?.args, ['run', 'dev']);
  });

  it('returns null for a docs-only folder', () => {
    assert.equal(detect(path.join(FIXTURES, 'docs-only')), null);
  });

  it('keeps packages without a start script but gives them no entry', () => {
    const detection = detect(path.join(FIXTURES, 'package-only'));
    assert.ok(detection);
    assert.equal(detection.kind, 'package');
    assert.equal(detection.entry, undefined);
  });

  it('flags missing node_modules for declared dependencies', () => {
    const dir = fixtureCopy('missing-deps');
    const detection = detect(dir);
    assert.ok(detection);
    const deps = detectDependencies(dir, { dependencies: { 'left-pad': '1.3.0' } }, 'node');
    assert.equal(deps.hasManifest, true);
    assert.equal(deps.installed, false);
    assert.deepEqual(deps.installCmd?.args, ['install']);
  });

  it('treats a project without declared dependencies as installed', () => {
    const deps = detectDependencies(path.join(FIXTURES, 'service'), {}, 'node');
    assert.equal(deps.installed, true);
  });
});
