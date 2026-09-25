import { test, expect } from '@playwright/test';

const readAngle = async locator => Number((await locator.textContent()).replace('−','-').match(/[-+]?\d+(?:\.\d+)?/)?.[0] ?? NaN);

test('settings, Escape, blur and tab hiding leave a flight in a safe state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s fly' }).click();
  await expect(page.locator('#game-hud')).toBeVisible();

  await page.getByRole('button', { name: /Controller/ }).click();
  const settings = page.locator('#settings-dialog');
  await expect(settings).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zero current tilt' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.setViewportSize({ width:360, height:640 });
  await page.locator('#disconnect-button').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name:'Close controller settings' })).toBeInViewport();
  await page.screenshot({ path:'test-results/settings-small-scrolled.png' });
  await page.setViewportSize({ width:1440, height:960 });

  // Escape closes the native modal, but must not silently resume the flight behind it.
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page.locator('#pause-panel')).toBeVisible();
  const pausedAt = await page.locator('#timer').innerText();
  await page.waitForTimeout(250);
  await expect(page.locator('#timer')).toHaveText(pausedAt);

  // A second Escape is an intentional resume once no modal is open.
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-panel')).toBeHidden();

  await page.keyboard.down('ArrowRight');
  await expect.poll(() => readAngle(page.locator('#roll-value'))).toBeGreaterThan(1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pause-panel')).toBeVisible();
  await expect(page.locator('#pause-reason')).toContainText('out of focus');
  await page.screenshot({ path: 'test-results/pause.png' });

  // Blur clears held controls; resuming must not leave the aircraft steering by itself.
  await page.getByRole('button', { name: 'Back to the sky' }).click();
  await expect.poll(async () => Math.abs(await readAngle(page.locator('#roll-value')))).toBeLessThan(.2);
  await page.keyboard.up('ArrowRight');

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#pause-panel')).toBeVisible();
  await expect(page.locator('#pause-reason')).toContainText('Tab hidden');
});

test('a timed run reaches an operable results screen using the browser clock', async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s fly' }).click();

  // Exercise the real requestAnimationFrame loop quickly; no app-only debug API is used.
  await page.clock.runFor(91_000);
  const results = page.locator('#result-panel');
  await expect(results).toBeVisible();
  await expect(page.locator('#result-copy')).toContainText(/rings? collected.*missed.*km flown/);
  await expect(page.locator('#result-score')).toHaveText(/^\d[\d,]*$/);
  await expect(page.locator('#result-perfect')).toHaveText('01');
  await expect(page.locator('#result-streak')).toHaveText('01');
  await expect(page.locator('#chart-label')).toHaveText('FLIGHT LOG / COPPER COAST');
  await expect(page.getByRole('button', { name: 'Another flight' })).toBeFocused();
  await page.screenshot({ path: 'test-results/results.png' });
  await page.setViewportSize({ width:360, height:640 });
  const home = page.getByRole('button', { name:'Back to flight lab' });
  await expect(home).toBeInViewport();
  expect(await home.evaluate(button => {
    const r = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
  await page.screenshot({ path:'test-results/results-small.png' });

  await page.getByRole('button', { name: 'Another flight' }).click();
  await expect(page.locator('#game-hud')).toBeVisible();
  await expect(page.locator('#timer')).toHaveText('01:30');
});

test.describe('small touchscreen', () => {
  test.use({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });

  test('flight controls and HUD remain reachable without horizontal overflow', async ({ page }) => {
    await page.goto('/');
    const launch = page.getByRole('button', { name: 'Let’s fly' });
    await expect(launch).toBeInViewport();
    await page.getByRole('button', { name: 'Flight guide' }).tap();
    await expect(page.locator('#help-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close help' }).tap();
    await launch.tap();

    await expect(page.locator('#game-hud')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeVisible();
    for (const name of ['Bank left', 'Climb', 'Descend', 'Bank right']) {
      const control = page.getByRole('button', { name });
      await expect(control).toBeInViewport();
      const bounds = await control.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    // Capture the settled controls, not the short launch toast/camera transition.
    await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 6_000 });
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: 'test-results/mobile-flight.png' });
  });
});
