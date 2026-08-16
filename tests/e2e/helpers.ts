import { expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4100';
export const API = `${API_URL}/api/v1`;

export const ADMIN = { email: 'admin@boutique.local', password: 'Admin@12345' };
export const CUSTOMER = { email: 'customer@boutique.local', password: 'Customer@12345' };

/** Unique identity per run so repeated E2E runs never collide. */
export function uniqueUser() {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    email: `e2e-${id}@example.com`,
    password: 'E2ePass123',
    firstName: 'Eve',
    lastName: 'Tester',
  };
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Direct API login, for setting up state without driving the UI. */
export async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.data.accessToken as string;
}

/** Guarantee stock so a purchase test cannot fail because the seed ran dry. */
export async function ensureStock(request: APIRequestContext, token: string, minimum = 25) {
  const list = await request.get(`${API}/admin/products?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await list.json();
  for (const product of body.data ?? []) {
    for (const variant of product.variants ?? []) {
      if ((variant.inventory?.quantity ?? 0) < minimum) {
        await request.patch(`${API}/admin/inventory/${variant.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { quantity: minimum + 25, changeType: 'RESTOCK', reason: 'E2E top-up' },
        });
      }
    }
  }
}

/**
 * Click "Add to bag" and wait for the cart drawer.
 *
 * The product page is server-rendered, so the button exists in the HTML before
 * React has hydrated and attached its handler. Playwright considers it
 * actionable and clicks straight through that window, and the click is
 * swallowed. Waiting for the storefront's own cart request confirms client JS
 * is live; the single retry covers the residual race.
 */
export async function addToBag(page: Page) {
  const button = page.getByRole('button', { name: /Add to bag/ });
  await button.waitFor({ state: 'visible' });
  await expectHydrated(page);

  await button.click();
  const drawer = page.getByRole('dialog');
  try {
    await drawer.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    // Hydration had not finished; the first click was inert.
    await button.click();
    await drawer.waitFor({ state: 'visible', timeout: 10_000 });
  }
  return drawer;
}

/** Resolves once client-side React has mounted and issued its cart request. */
async function expectHydrated(page: Page) {
  await page.waitForFunction(
    () => window.localStorage.getItem('boutique.sessionId') !== null,
    undefined,
    { timeout: 10_000 },
  ).catch(() => undefined);
}
