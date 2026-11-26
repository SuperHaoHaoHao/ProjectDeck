import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type { GitInfo } from './types.js';

export function isGitRepo(dir: string): boolean {
  try {
    return fs.statSync(`${dir}/.git`).isDirectory() || fs.statSync(`${dir}/.git`).isFile();
  } catch {
    return false;
  }
}

function run(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 2500,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

export function readGit(dir: string): GitInfo | undefined {
  if (!isGitRepo(dir)) return undefined;
  const info: GitInfo = { branch: '', dirty: 0, lastCommit: '', lastDate: '', remote: '' };
  try {
    info.branch = run(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
  } catch {}
  try {
    const dirty = run(['status', '--porcelain'], dir);
    info.dirty = dirty ? dirty.split('\n').filter(Boolean).length : 0;
  } catch {}
  try {
    const line = run(['log', '-1', '--format=%h%x09%cs%x09%s'], dir);
    const [hash = '', date = '', ...subject] = line.split('\t');
    info.lastCommit = `${hash} ${subject.join(' ')}`.trim();
    info.lastDate = date;
  } catch {}
  try {
    info.remote = run(['remote', 'get-url', 'origin'], dir);
  } catch {}
  return info;
}
