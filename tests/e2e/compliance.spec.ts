import { expect, test } from '@playwright/test';
import { withSession } from './fixtures';
import { addToBag, apiLogin, ADMIN, API, ensureStock } from './helpers';

const customerTest = withSession('customer');

/**
 * The paths that decide whether the store can legally take money: the policy
 * pages a customer is entitled to read, GST-inclusive pricing, cash on
 * delivery, the tax invoice, and returns.
 */

const POLICY_PAGES = [
  { path: '/privacy', heading: 'Privacy Policy' },
  { path: '/terms', heading: 'Terms of Service' },
  { path: '/shipping', heading: 'Shipping & Delivery' },
  { path: '/returns', heading: 'Returns & Refunds' },
  { path: '/contact', heading: 'Get in touch' },
];

test.describe('Policy pages', () => {
  for (const { path, heading } of POLICY_PAGES) {
    test(`${path} is published and readable`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      // A policy page that is all heading and no policy is not a policy page.
      const body = await page.locator('main, body').first().innerText();
      expect(body.length).toBeGreaterThan(800);
    });
  }

  test('every footer policy link resolves', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    for (const label of ['Shipping', 'Returns', 'Contact', 'Privacy', 'Terms']) {
      const link = footer.getByRole('link', { name: label }).first();
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      const response = await page.request.get(href!);
      expect(response.status(), `${label} -> ${href}`).toBe(200);
    }
  });

  test('the sitemap lists products and categories', async ({ page }) => {
    const response = await page.request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    // A sitemap that lists only the static pages tells search engines the
    // catalogue does not exist.
    expect(xml).toContain('/products/');
    expect(xml).toContain('/category/');
    expect((xml.match(/<url>/g) ?? []).length).toBeGreaterThan(10);
  });

  test('robots.txt points at the sitemap and hides private routes', async ({ page }) => {
    const response = await page.request.get('/robots.txt');
    const text = await response.text();
    expect(text).toContain('Sitemap:');
    expect(text).toContain('Disallow: /admin');
    expect(text).toContain('Disallow: /checkout');
  });
});

test.describe('Contact form', () => {
  test('a customer can send a message and is told it arrived', async ({ page }) => {
    await page.goto('/contact');
    await page.getByLabel('Your name').fill('Meera Iyer');
    await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel('Message').fill(
      'Is the linen shirt true to size? I usually take a medium.',
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('status')).toContainText('Message sent', { timeout: 15_000 });
  });
});

test.describe('GST-inclusive pricing', () => {
  test('the cart states the GST inside the price rather than adding it', async ({ page }) => {
    await page.goto('/products');
    await page.locator('a[href^="/products/"]').first().click();
    await addToBag(page);
    await page.goto('/cart');

    // "Inclusive of ... GST" - never a separate Tax line added to the total,
    // which would charge the customer twice for the same rupees.
    await expect(page.getByText(/Inclusive of .* GST/)).toBeVisible();

    const summary = page.locator('dl').first();
    await expect(summary.getByText(/^Tax$/)).toHaveCount(0);
  });
});

test.describe('Cash on delivery', () => {
  test('a customer can pay at the door and gets a tax invoice', async ({ page, request }) => {
    const token = await apiLogin(request, ADMIN.email, ADMIN.password);
    await ensureStock(request, token);

    await page.goto('/products');
    await page.locator('a[href^="/products/"]').first().click();
    await addToBag(page);

    await page.goto('/checkout');
    const email = `cod-e2e-${Date.now()}@example.com`;
    await page.getByLabel('Email').first().fill(email);
    await page.getByLabel('Full name').fill('Ananya Rao');
    await page.getByLabel('Phone').fill('9876543210');
    await page.getByLabel(/Address line 1/i).fill('12 Lavelle Road');
    await page.getByLabel('City').fill('Bengaluru');
    await page.getByLabel('State').fill('Karnataka');
    await page.getByLabel(/PIN code|Postal/i).fill('560001');

    const cod = page.getByRole('radio', { name: /Cash on delivery/i });
    await expect(cod).toBeEnabled();
    await cod.check();

    // The button changes because there is no gateway to visit.
    await expect(page.getByRole('button', { name: 'Place order' })).toBeVisible();
    await page.getByRole('button', { name: 'Place order' }).click();

    await page.waitForURL(/\/order-confirmation\//, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Thank you for your order/i })).toBeVisible();
    await expect(page.getByText(/keep .* ready for the courier/i)).toBeVisible();

    // The tax invoice must be available the moment the order is confirmed.
    const orderId = page.url().match(/order-confirmation\/([^?]+)/)?.[1];
    expect(orderId).toBeTruthy();
    const invoice = await request.get(
      `${API}/invoices/order/${orderId}?email=${encodeURIComponent(email)}`,
    );
    expect(invoice.status()).toBe(200);
    const html = await invoice.text();
    expect(html).toContain('Tax Invoice');
    expect(html).toContain('GSTIN');
    expect(html).toMatch(/INV\/\d{4}-\d{2}\/\d{5}/);
  });
});

customerTest.describe('Returns', () => {
  customerTest('a signed-in customer can see their returns', async ({ page }) => {
    await page.goto('/account/returns');
    // Either the list or the empty state - never a crash or a blank page.
    await expect(
      page.getByRole('heading', { name: /Returns|No returns yet/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Returns' }).first()).toBeVisible();
  });
});
