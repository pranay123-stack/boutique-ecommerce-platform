import { test as setup, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { ADMIN, CUSTOMER } from './helpers';

/**
 * Authenticate once per run and persist the session for reuse.
 *
 * Two things make this less trivial than the usual storageState recipe, and
 * both are deliberate product behaviours we do not want to weaken:
 *
 *  1. /auth/login is rate limited, so logging in inside every test trips a
 *     real protection.
 *  2. Refresh tokens rotate and the server revokes the entire token family if
 *     a rotated token is ever replayed. Restoring the same cookie into several
 *     browser contexts looks exactly like token theft - correctly, the second
 *     context gets logged out.
 *
 * So we capture the short-lived access token too and replay it into
 * sessionStorage, which means restored contexts never need to refresh.
 */
async function capture(page: import('@playwright/test').Page, name: string) {
  const accessToken = await page.evaluate(() => window.sessionStorage.getItem('boutique.accessToken'));
  if (!accessToken) throw new Error(`No access token captured for ${name}`);
  await page.context().storageState({ path: `.auth/${name}.json` });
  writeFileSync(`.auth/${name}-token.json`, JSON.stringify({ accessToken }), 'utf8');
}

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });
  await capture(page, 'admin');
});

setup('authenticate as customer', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(CUSTOMER.email);
  await page.getByLabel('Password').fill(CUSTOMER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account/, { timeout: 30_000 });
  await capture(page, 'customer');
});
