import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { isIgnoredName, parseArgs, stateDir } from '../../src/server/config.js';

describe('config', () => {
  afterEach(() => {
    delete process.env.PROJECTDECK_HOME;
  });

  it('defaults the state dir to ~/.projectdeck', () => {
    assert.equal(stateDir(), path.join(os.homedir(), '.projectdeck'));
  });

  it('honours PROJECTDECK_HOME so tests never touch the real state', () => {
    process.env.PROJECTDECK_HOME = '/tmp/projectdeck-test-home';
    assert.equal(stateDir(), '/tmp/projectdeck-test-home');
  });

  it('parses repeated roots and flags', () => {
    const args = parseArgs(['--root', '/a', '--root=/b', '--port', '4400', '--no-open', '--all']);
    assert.deepEqual(args.roots, ['/a', '/b']);
    assert.equal(args.port, 4400);
    assert.equal(args.noOpen, true);
    assert.equal(args.all, true);
  });

  it('skips heavy and vendor directories', () => {
    const ignore = ['node_modules', 'dist'];
    assert.equal(isIgnoredName('node_modules', ignore), true);
    assert.equal(isIgnoredName('.git', ignore), true);
    assert.equal(isIgnoredName('HBuilder-uniPluginDemo', ignore), true);
    assert.equal(isIgnoredName('my-service', ignore), false);
  });
});
