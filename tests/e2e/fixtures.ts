import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Test fixture that restores a captured session without triggering a token
 * refresh - see auth.setup.ts for why replaying the refresh cookie would
 * (correctly) get the session revoked.
 */
export function withSession(role: 'admin' | 'customer') {
  return base.extend({
    // eslint-disable-next-line no-empty-pattern
    storageState: async ({}, use) => {
      await use(`.auth/${role}.json`);
    },
    page: async ({ page }, use) => {
      const { accessToken } = JSON.parse(readFileSync(`.auth/${role}-token.json`, 'utf8'));
      // Seeded before any app code runs on every navigation in this context.
      await page.addInitScript(
        ([key, value]) => window.sessionStorage.setItem(key as string, value as string),
        ['boutique.accessToken', accessToken],
      );
      await use(page);
    },
  });
}

export { expect };
