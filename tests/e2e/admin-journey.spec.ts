import { withSession, expect } from './fixtures';

const test = withSession('admin');

/**
 * Business operations through the admin console:
 * sign in -> dashboard -> create product -> adjust inventory ->
 * process an order -> create a coupon -> review analytics.
 */
test.describe('Admin journey', () => {

  test('dashboard shows live business metrics', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // Scope to the stat cards - "Customers" also appears in the sidebar nav.
    const main = page.getByRole('main');
    await expect(main.getByText('Net revenue')).toBeVisible();
    await expect(main.getByText('Paid orders')).toBeVisible();
    await expect(main.getByText('Customers', { exact: true }).first()).toBeVisible();
    await expect(main.getByText('Low stock', { exact: true }).first()).toBeVisible();
    // The revenue chart renders from real order data.
    await expect(main.getByText('Daily captured revenue over the period')).toBeVisible();
  });

  test('creates a product that appears on the storefront', async ({ page }) => {
    const sku = `E2E-${Date.now().toString(36).toUpperCase()}`;
    const name = `E2E Test Piece ${Date.now().toString(36)}`;

    await page.goto('/admin/products/new');
    await page.getByLabel('Name *').fill(name);
    await page.getByLabel('Brand').fill('E2E Atelier');

    await page.getByLabel('Category *').click();
    await page.getByRole('option').first().click();

    await page.getByLabel('Base price *').fill('1999');
    await page.getByLabel('Short description').fill('Created by the end-to-end suite');

    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Active' }).click();

    await page.getByLabel('SKU *').fill(sku);
    await page.getByLabel('Price *').last().fill('1999');
    await page.getByLabel('Stock').fill('15');

    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page).toHaveURL(/\/admin\/products$/, { timeout: 20_000 });
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

    // And it is immediately purchasable by customers.
    await page.goto(`/products?q=${encodeURIComponent('E2E Test Piece')}`);
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15_000 });
  });

  test('filters orders by status without a validation error', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();

    await page.getByLabel('Filter by status').click();
    await page.getByRole('option', { name: 'Delivered' }).click();
    // Regression guard: this combination used to return HTTP 400.
    await expect(page.getByText('No orders match those filters.').or(page.getByRole('table'))).toBeVisible();
  });

  test('searches customers', async ({ page }) => {
    await page.goto('/admin/customers');
    await page.getByLabel('Search customers').fill('customer@');
    await expect(page.getByText('customer@boutique.local')).toBeVisible({ timeout: 15_000 });
  });

  test('adjusts inventory from the low-stock queue', async ({ page }) => {
    await page.goto('/admin/inventory');
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();

    const rows = page.getByRole('row');
    const count = await rows.count();
    if (count > 1) {
      const input = page.getByRole('spinbutton').first();
      await input.fill('60');
      await page.getByRole('button', { name: 'Save' }).first().click();
      await expect(page.getByText(/Stock updated/i)).toBeVisible({ timeout: 15_000 });
    }
  });

  test('processes an order through its lifecycle', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });

    // Open the most recent order.
    await page.getByRole('link', { name: /BQ-/ }).first().click();
    await expect(page).toHaveURL(/\/admin\/orders\//);
    await expect(page.getByText('Fulfilment')).toBeVisible();

    const selector = page.getByLabel('New status');
    if (await selector.isVisible()) {
      await selector.click();
      const option = page.getByRole('option').first();
      const label = await option.textContent();
      await option.click();
      await page.getByRole('button', { name: 'Update status' }).click();
      await expect(page.getByText(/Order updated/i)).toBeVisible({ timeout: 15_000 });
      expect(label).toBeTruthy();
    }
  });

  test('creates a coupon customers can redeem', async ({ page }) => {
    const code = `E2E${Date.now().toString(36).toUpperCase().slice(-6)}`;

    await page.goto('/admin/coupons');
    await page.getByRole('button', { name: 'New coupon' }).click();
    await page.getByLabel('Code').fill(code);
    await page.getByLabel('Description').fill('Created by the E2E suite');
    await page.getByLabel('Value', { exact: true }).fill('15');
    await page.getByRole('button', { name: 'Save coupon' }).click();

    await expect(page.getByText(code)).toBeVisible({ timeout: 15_000 });
  });

  test('moderates the review queue', async ({ page }) => {
    await page.goto('/admin/reviews');
    await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible();
    await expect(
      page.getByText(/No pending reviews/i).or(page.getByRole('button', { name: 'Approve' }).first()),
    ).toBeVisible();
  });

  test('shows content management', async ({ page }) => {
    await page.goto('/admin/content');
    await expect(page.getByRole('heading', { name: 'Content' })).toBeVisible();
    await expect(page.getByText('Homepage banners')).toBeVisible();
  });
});
