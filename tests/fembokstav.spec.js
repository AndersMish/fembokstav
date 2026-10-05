const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SHOTS = path.join(__dirname, '..', 'screenshots');

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
});

async function openFresh(page) {
  await page.addInitScript(() => {
    localStorage.setItem('fembokstav.seen_help', '1');
    localStorage.removeItem('fembokstav.daily_v1');
  });
  await page.goto('/');
  await expect(page.locator('.board .tile')).toHaveCount(30, { timeout: 15000 });
  const help = page.locator('#modal-help');
  if (await help.isVisible()) {
    await page.locator('#modal-help .modal-close').click();
    await expect(help).toBeHidden();
  }
}

async function typeWord(page, word) {
  for (const ch of word.toLowerCase()) {
    if ('æøå'.includes(ch)) {
      await page.locator(`.key[data-key="${ch}"]`).click();
    } else {
      await page.keyboard.type(ch);
    }
  }
}

async function waitFlips(page) {
  await page.waitForTimeout(1800);
}

test('empty board + æøå keyboard', async ({ page }) => {
  await openFresh(page);
  await expect(page.locator('h1')).toHaveText('Fembokstav');
  await expect(page.locator('.key[data-key="æ"]')).toBeVisible();
  await expect(page.locator('.key[data-key="ø"]')).toBeVisible();
  await expect(page.locator('.key[data-key="å"]')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, '01-empty-board.png'), fullPage: true });
});

test('invalid guess shakes and toasts', async ({ page }) => {
  await openFresh(page);
  await page.evaluate(() => window.__FEMBOKSTAV__.startPractice('skole'));
  await typeWord(page, 'zzzzz');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Ikke i ordlista');
  await expect(page.locator('.row').first()).toHaveClass(/shake/);
});

test('play a winning round with injected answer', async ({ page }) => {
  await openFresh(page);
  await page.evaluate(() => window.__FEMBOKSTAV__.startPractice('grønn'));

  await typeWord(page, 'skole');
  await page.keyboard.press('Enter');
  await waitFlips(page);

  const midTiles = page.locator('.row').first().locator('.tile');
  await expect(midTiles.nth(0)).toHaveClass(/absent|present|correct/);
  await page.screenshot({ path: path.join(SHOTS, '02-mid-game.png'), fullPage: true });

  await typeWord(page, 'brann');
  await page.keyboard.press('Enter');
  await waitFlips(page);

  await typeWord(page, 'grønn');
  await page.locator('.key[data-key="Enter"]').click();
  await waitFlips(page);
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => window.__FEMBOKSTAV__.getState());
  expect(state.gameOver).toBe(true);

  const stats = page.locator('#modal-stats');
  if (await stats.isVisible()) {
    await page.locator('#modal-stats .modal-close').click();
  }
  await page.screenshot({ path: path.join(SHOTS, '03-win.png'), fullPage: true });

  await expect(page.locator('.key[data-key="ø"]')).toBeVisible();
  // ø key should be marked correct after winning with grønn
  await expect(page.locator('.key[data-key="ø"]')).toHaveClass(/correct/);
});

test('lose round screenshot', async ({ page }) => {
  await openFresh(page);
  await page.evaluate(() => window.__FEMBOKSTAV__.startPractice('ønske'));

  const guesses = ['skole', 'brann', 'huske', 'frost', 'plask', 'drama'];
  for (const g of guesses) {
    await typeWord(page, g);
    await page.keyboard.press('Enter');
    await waitFlips(page);
  }
  const state = await page.evaluate(() => window.__FEMBOKSTAV__.getState());
  expect(state.gameOver).toBe(true);

  await page.waitForTimeout(800);
  const stats = page.locator('#modal-stats');
  if (await stats.isVisible()) {
    await page.locator('#modal-stats .modal-close').click();
  }
  await page.screenshot({ path: path.join(SHOTS, '04-lose.png'), fullPage: true });
});

test('click æøå keys on virtual keyboard', async ({ page }) => {
  await openFresh(page);
  await page.evaluate(() => window.__FEMBOKSTAV__.startPractice('blåse'));

  await page.locator('.key[data-key="b"]').click();
  await page.locator('.key[data-key="l"]').click();
  await page.locator('.key[data-key="å"]').click();
  await page.locator('.key[data-key="s"]').click();
  await page.locator('.key[data-key="e"]').click();

  const tiles = page.locator('.row').first().locator('.tile');
  await expect(tiles.nth(0)).toHaveText(/b/i);
  await expect(tiles.nth(2)).toHaveText(/å/i);
});
