import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { belongsTo } from '../../src/server/ports.js';

const tempDirs: string[] = [];

describe('port ownership', () => {
  after(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepts the project dir itself', () => {
    assert.equal(belongsTo('/a/proj', '/a/proj'), true);
    assert.equal(belongsTo('/a/proj/', '/a/proj'), true);
  });

  it('accepts a child working directory (vite runs in client/)', () => {
    assert.equal(belongsTo('/a/proj', '/a/proj/client'), true);
  });

  it('rejects a sibling project that happens to use the same port', () => {
    assert.equal(belongsTo('/a/proj', '/a/proj-other'), false);
    assert.equal(belongsTo('/a/proj', '/b/proj'), false);
  });

  it('rejects an unknown owner', () => {
    assert.equal(belongsTo('/a/proj', undefined), false);
    assert.equal(belongsTo('/a/proj', ''), false);
  });

  it('matches through symlinks (macOS /var vs /private/var from lsof)', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'projectdeck-link-'));
    tempDirs.push(base);
    const real = path.join(base, 'real');
    fs.mkdirSync(real);
    const link = path.join(base, 'link');
    fs.symlinkSync(real, link);

    assert.equal(belongsTo(link, real), true);
    assert.equal(belongsTo(link, path.join(real, 'client')), true);
    assert.equal(belongsTo(real, link), true);
  });
});
