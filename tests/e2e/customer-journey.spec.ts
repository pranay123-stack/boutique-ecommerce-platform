import { test, expect } from '@playwright/test';
import { ADMIN, apiLogin, ensureStock, uniqueUser , addToBag } from './helpers';

/**
 * The complete customer path, driven through the real UI:
 * register -> browse -> search -> filter -> add to cart -> coupon ->
 * checkout -> pay -> order confirmed -> track.
 */
test.describe('Customer journey', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const token = await apiLogin(request, ADMIN.email, ADMIN.password);
    await ensureStock(request, token);
    await request.dispose();
  });

  test('homepage presents the storefront', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Boutique/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Featured merchandising must actually render products.
    await expect(page.getByRole('article').first()).toBeVisible();
  });

  test('renders every image, not just the layout', async ({ page }) => {
    // Regression: image URLs were stored absolute ("http://localhost:4100/..").
    // The browser could load them, but next/image optimises server-side and in
    // a container "localhost" is the frontend itself - so /_next/image returned
    // 500 and every product image rendered broken while the page still looked
    // structurally fine. Asserting on markup alone missed it entirely.
    for (const path of ['/', '/products', '/products/linen-wrap-dress']) {
      await page.goto(path, { waitUntil: 'networkidle' });

      // Below-the-fold cards use loading="lazy", so they have not started
      // fetching yet and are neither loaded nor broken. Scroll the page to
      // trigger them before measuring, otherwise the count is simply a race.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForLoadState('networkidle');

      const { total, loaded, broken } = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('img')];
        return {
          total: imgs.length,
          loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
          broken: imgs
            .filter((i) => i.complete && i.naturalWidth === 0)
            .map((i) => i.currentSrc || i.src),
        };
      });

      expect(total, `${path} should render images`).toBeGreaterThan(0);
      // The regression guard: nothing finished loading at zero width.
      expect(broken, `${path} has broken images`).toEqual([]);
      expect(loaded, `${path} loaded no images`).toBeGreaterThan(0);
    }
  });

  test('browses, searches and filters the catalogue', async ({ page }) => {
    await page.goto('/products');
    await expect(page.getByRole('article').first()).toBeVisible();

    // Search
    await page.goto('/products?q=silk');
    await expect(page.getByRole('heading', { name: /Results for/ })).toBeVisible();
    await expect(page.getByRole('article').first()).toBeVisible();

    // Sort
    await page.goto('/products?sort=price_asc');
    await expect(page.getByRole('article').first()).toBeVisible();

    // Filter by stock
    await page.goto('/products?inStock=true');
    await expect(page.getByRole('article').first()).toBeVisible();
  });

  test('opens a product and sees variants and stock', async ({ page }) => {
    await page.goto('/products');
    await page.getByRole('article').first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/products\/[a-z0-9-]+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add to bag/ })).toBeVisible();
  });

  test('completes registration, purchase and payment', async ({ page }) => {
    const user = uniqueUser();

    // ---- register
    await page.goto('/register');
    await page.getByLabel('First name').fill(user.firstName);
    await page.getByLabel('Last name').fill(user.lastName);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/account/, { timeout: 20_000 });

    // ---- pick a product and add it to the bag
    await page.goto('/products?inStock=true');
    await page.getByRole('article').first().getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await addToBag(page);
    await page.keyboard.press('Escape');

    // ---- cart
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Your bag' })).toBeVisible();
    // Confirm the line actually persisted before exercising the coupon form,
    // which only renders when the bag has contents and no code applied.
    await expect(page.getByRole('button', { name: /Remove/ }).first()).toBeVisible();

    // ---- coupon
    await page.getByLabel('Discount code').fill('FREESHIP');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('FREESHIP')).toBeVisible({ timeout: 15_000 });

    // ---- checkout
    await page.getByRole('link', { name: /Proceed to checkout/ }).click();
    await expect(page).toHaveURL(/\/checkout/);

    await page.getByLabel('Full name').fill('Eve Tester');
    await page.getByLabel('Phone').fill('+919876543210');
    await page.getByLabel('Address line 1').fill('22 Residency Road');
    await page.getByLabel('City').fill('Bengaluru');
    await page.getByLabel('State').fill('Karnataka');
    await page.getByLabel('PIN code').fill('560025');

    await page.getByRole('button', { name: /Continue to payment/ }).click();
    await expect(page).toHaveURL(/\/checkout\/payment/, { timeout: 20_000 });

    // ---- payment (mock gateway: signature is still generated and verified)
    const pay = page.getByRole('button', { name: /^Pay / });
    await expect(pay).toBeVisible({ timeout: 20_000 });
    await pay.click();

    // ---- confirmation
    await expect(page).toHaveURL(/\/order-confirmation\//, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Thank you for your order/ })).toBeVisible();
    const orderNumber = await page.locator('text=/BQ-\\d{8}-[A-Z0-9]{6}/').first().textContent();
    expect(orderNumber).toMatch(/BQ-\d{8}-[A-Z0-9]{6}/);

    // ---- order appears in history and can be tracked
    await page.goto('/account/orders');
    await expect(page.getByText(orderNumber!.trim())).toBeVisible();

    await page.getByText(orderNumber!.trim()).click();
    await expect(page).toHaveURL(/\/account\/orders\//);
    await expect(page.getByText(/Payment confirmed|Payment captured|Captured/i).first()).toBeVisible();
  });

  test('checks out using a saved address', async ({ page }) => {
    // Regression: the checkout page posted the saved address object verbatim,
    // including id/userId/label/timestamps. The API rejects unknown properties,
    // so picking a saved address returned 400 and a returning customer - the
    // most valuable kind - could not complete an order. Every other test typed
    // the address by hand and never hit it.
    await page.goto('/login');
    await page.getByLabel('Email').fill('customer@boutique.local');
    await page.getByLabel('Password').fill('Customer@12345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/account/, { timeout: 20_000 });

    await page.goto('/products?inStock=true');
    await page.getByRole('article').first().getByRole('link').first().click();
    await addToBag(page);
    await page.keyboard.press('Escape');

    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();

    const savedCard = page.getByText('Saved addresses');
    if (await savedCard.isVisible().catch(() => false)) {
      // Choose a saved address rather than typing one.
      await page.locator('button').filter({ hasText: /Bengaluru|Mysuru/ }).first().click();
      await page.getByRole('button', { name: /Continue to payment/ }).click();
      await expect(page).toHaveURL(/\/checkout\/payment/, { timeout: 20_000 });
      await expect(page.getByRole('button', { name: /^Pay / })).toBeVisible({ timeout: 20_000 });
    }
  });

  test('supports guest checkout without an account', async ({ page }) => {
    await page.goto('/products?inStock=true');
    await page.getByRole('article').first().getByRole('link').first().click();
    await addToBag(page);
    await page.keyboard.press('Escape');

    await page.goto('/cart');
    await expect(page.getByRole('button', { name: /Remove/ }).first()).toBeVisible();

    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    const guestEmail = `guest-${Date.now().toString(36)}@example.com`;
    await page.getByLabel('Email').fill(guestEmail);
    await page.getByLabel('Full name').fill('Guest Buyer');
    await page.getByLabel('Phone').fill('+919812345678');
    await page.getByLabel('Address line 1').fill('9 MG Road');
    await page.getByLabel('City').fill('Bengaluru');
    await page.getByLabel('State').fill('Karnataka');
    await page.getByLabel('PIN code').fill('560001');

    await page.getByRole('button', { name: /Continue to payment/ }).click();
    await expect(page).toHaveURL(/\/checkout\/payment/, { timeout: 20_000 });
    await expect(page.getByRole('button', { name: /^Pay / })).toBeVisible({ timeout: 20_000 });
  });

  test('rejects a bad sign-in and accepts a good one', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('customer@boutique.local');
    await page.getByLabel('Password').fill('WrongPassword1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Stays on the login page; an error toast is shown.
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('Password').fill('Customer@12345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/account/, { timeout: 20_000 });
  });

  test('protects the account area from anonymous visitors', async ({ page }) => {
    await page.goto('/account/orders');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('keeps the storefront out of the admin console', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('customer@boutique.local');
    await page.getByLabel('Password').fill('Customer@12345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/account/, { timeout: 20_000 });

    // A CUSTOMER must be bounced away from /admin.
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin$/, { timeout: 15_000 });
  });
});
