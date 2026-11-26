import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright-core';
import { startDeck, type Deck } from '../helpers/deck.js';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((item): item is string => Boolean(item));

function chromePath(): string | undefined {
  return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
}

const executable = chromePath();

describe('ProjectDeck UI', { skip: executable ? false : 'no Chrome/Chromium found' }, () => {
  let deck: Deck;
  let browser: Browser;
  let page: Page;
  const pageErrors: string[] = [];

  before(async () => {
    deck = await startDeck();
    browser = await chromium.launch({ executablePath: executable!, headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });

  after(async () => {
    await browser?.close();
    await deck?.close();
  });

  it('renders the catalog', async () => {
    await page.goto(`${deck.base}/?lang=zh#/projects`, { waitUntil: 'networkidle' });
    await page.getByText('项目列表').first().waitFor();
    assert.equal(await page.locator('tbody tr').count() >= 3, true);
    await page.locator('tbody tr').filter({ hasText: 'service' }).first().waitFor();
  });

  it('starts a project from the list and shows it as running', async () => {
    const row = page.locator('tbody tr').filter({ hasText: 'service' }).first();
    await row.getByRole('button', { name: '启动' }).click();

    await page
      .locator('tbody tr')
      .filter({ hasText: 'service' })
      .first()
      .locator('[data-status="running"]')
      .waitFor({ timeout: 20_000 });
  });

  it('opens on the overview tab, then streams real logs into the terminal', async () => {
    await page.locator('tbody tr').filter({ hasText: 'service' }).first().click();
    await page.waitForURL(/#\/project\//);

    // 默认应该是概览，不是终端
    await page.getByText('运行信息').first().waitFor({ timeout: 10_000 });
    assert.equal(await page.getByText(/fixture-service ready on/).count(), 0);

    await page.getByRole('button', { name: '终端日志' }).click();
    await page.getByText(/fixture-service ready on http:\/\/127\.0\.0\.1:\d+/).waitFor({ timeout: 20_000 });
    assert.equal(await page.locator('[data-testid="failure-banner"]').count(), 0);
  });

  it('stops the project from the detail page', async () => {
    await page.getByRole('button', { name: '停止' }).first().click();
    await page.locator('[data-status="stopped"]').first().waitFor({ timeout: 20_000 });
  });

  it('surfaces a failed start instead of pretending it worked', async () => {
    const payload = (await (await fetch(`${deck.base}/api/projects`)).json()) as {
      projects: { id: string; name: string }[];
    };
    const broken = payload.projects.find((project) => project.name === 'broken');
    assert.ok(broken);

    await page.goto(`${deck.base}/?lang=zh#/project/${broken.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '启动' }).first().click();
    await page.locator('[data-testid="failure-banner"]').waitFor({ timeout: 20_000 });
    await page.getByText(/启动失败/).first().waitFor();
  });

  it('switches the whole UI to English', async () => {
    await page.goto(`${deck.base}/?lang=zh#/projects`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '语言' }).click();
    await page.getByText('Projects', { exact: true }).first().waitFor({ timeout: 10_000 });
    await page.locator('tbody tr').filter({ hasText: 'service' }).first().waitFor();
  });

  it('produced no uncaught page errors', () => {
    assert.deepEqual(pageErrors, []);
  });
});
