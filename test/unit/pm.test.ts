import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyFailure } from '../../src/server/pm.js';

describe('classifyFailure', () => {
  it('recognises a busy port', () => {
    assert.equal(classifyFailure('Error: listen EADDRINUSE: address already in use :::3000'), 'port-in-use');
    assert.equal(classifyFailure('bind: address already in use'), 'port-in-use');
  });

  it('recognises missing dependencies and modules', () => {
    assert.equal(classifyFailure("Error: Cannot find module 'vite'"), 'missing-deps');
    assert.equal(classifyFailure('ModuleNotFoundError: No module named flask'), 'missing-deps');
  });

  it('recognises missing scripts and commands', () => {
    assert.equal(classifyFailure('npm error Missing script: "dev"'), 'missing-script');
    assert.equal(classifyFailure('sh: vite: command not found'), 'missing-script');
  });

  it('returns undefined for normal output', () => {
    assert.equal(classifyFailure('Local: http://localhost:5173/'), undefined);
    assert.equal(classifyFailure('compiled successfully'), undefined);
  });
});
