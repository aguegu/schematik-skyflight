import { test, expect } from '@playwright/test';

test('reduced motion holds the showcase still without disabling flight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if(message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const canvas = page.locator('#world canvas');
  const still = await canvas.screenshot();
  await page.waitForTimeout(500);
  expect(still.equals(await canvas.screenshot())).toBe(true);
  await page.getByRole('button', { name: 'Let’s fly' }).click();
  await expect(page.locator('#score')).not.toHaveText('0000', { timeout: 12000 });
  await expect(page.locator('#combo-copy')).toHaveText('01 RING IN A ROW');
  await expect(page.locator('#next-gate-time')).toHaveText(/\d\.\ds/);
  expect(errors).toEqual([]);
});

test('graphics loss pauses an active flight with recovery guidance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s fly' }).click();
  await page.locator('#world canvas').dispatchEvent('webglcontextlost', { cancelable: true });
  await expect(page.locator('#pause-panel')).toBeVisible();
  await expect(page.locator('#pause-reason')).toContainText('Graphics connection lost');
  await expect(page.locator('#resume-button')).toBeFocused();
  await expect(page.locator('#toast')).toContainText('reload');
});
