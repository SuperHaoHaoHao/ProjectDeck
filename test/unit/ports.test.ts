import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { belongsTo } from '../../src/server/ports.js';

describe('port ownership', () => {
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
});
