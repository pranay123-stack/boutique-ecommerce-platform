import { test, expect } from '@playwright/test';
import { addToBag } from './helpers';

/** Runs on the Pixel 7 project - the storefront must work on a phone. */
test.describe('Mobile storefront', () => {
  test('homepage is usable and does not scroll sideways', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Horizontal overflow is the classic mobile layout failure.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test('mobile navigation opens', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    const allProducts = drawer.getByRole('link', { name: 'All products' });
    await allProducts.scrollIntoViewIfNeeded();
    await expect(allProducts).toBeVisible();
  });

  test('product grid and detail render on a phone', async ({ page }) => {
    await page.goto('/products');
    await expect(page.getByRole('article').first()).toBeVisible();

    await page.getByRole('article').first().getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add to bag/ })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test('cart drawer works on a phone', async ({ page }) => {
    await page.goto('/products?inStock=true');
    await page.getByRole('article').first().getByRole('link').first().click();
    await addToBag(page);
    await expect(page.getByRole('link', { name: 'Checkout' })).toBeVisible();
  });
});
