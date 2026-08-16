/**
 * Database seed.
 *
 * Creates the role/permission matrix, staff and demo accounts, a boutique
 * catalogue with variants and stock, coupons, banners and a set of historical
 * orders so the analytics dashboard has something real to display.
 *
 *   npm run db:seed              full demo dataset
 *   npm run db:seed -- --minimal roles + accounts only (used by the test suite)
 *   npm run db:seed -- --reset   wipe first, then seed
 */
import { PrismaClient, Prisma, ProductStatus, OrderStatus, PaymentStatus, AttributeType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { ROLES, ROLE_PERMISSIONS } from '../src/common/constants';
import { CATEGORIES, COUPONS, PRODUCTS, type SeedProduct } from './seed-data';
import { classify } from '../src/modules/tax/hsn-catalogue';
import { generateOrderNumber } from '../src/common/utils/order-number';

loadEnv();

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const MINIMAL = args.includes('--minimal');
const RESET = args.includes('--reset');
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);
const UPLOAD_ROOT = resolve(process.env.STORAGE_LOCAL_PATH ?? './uploads');

const log = (msg: string) => console.log(`  ${msg}`);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Generate a placeholder image on local disk.
 *
 * Deliberately not an external URL: the storefront must render identically
 * offline, in CI and on a plane. SVG keeps each file around 1KB.
 */
/**
 * Where product imagery comes from, chosen with SEED_IMAGE_SOURCE:
 *
 *   generated  (default) locally drawn SVG silhouettes - offline, deterministic,
 *              no licensing questions.
 *   picsum     real photography from Lorem Picsum (Unsplash License: commercial
 *              use, no attribution). Clean and high quality, but the subject is
 *              unrelated to the product - a landscape may end up on a dress.
 *   unsplash   real, keyword-matched product photography via the Unsplash API.
 *              Best looking by far; needs a free UNSPLASH_ACCESS_KEY, which
 *              is issued after a review taking several business days.
 *   pexels     the same idea via the Pexels API, whose key is issued
 *              instantly. Use this when waiting on Unsplash approval.
 *
 * Whichever is chosen, bytes are downloaded once and stored locally, so the
 * demo keeps working offline afterwards. Any failure falls back to `generated`
 * rather than leaving a product with no image.
 *
 * Both keyed providers require the photographer to be credited wherever their
 * work appears - see `recordCredit` below. Photographers give the work away
 * for free; the credit is the whole of what they get back.
 */
type ImageSource = 'generated' | 'picsum' | 'unsplash' | 'pexels';

const IMAGE_SOURCE = (process.env.SEED_IMAGE_SOURCE ?? 'generated') as ImageSource;
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY ?? '';
const PEXELS_KEY = process.env.PEXELS_API_KEY ?? '';

let photoAttempts = 0;
let photoSuccesses = 0;

/** A downloaded photograph together with everything needed to credit it. */
interface SourcedPhoto {
  bytes: Buffer;
  credit: PhotoCredit;
}

export interface PhotoCredit {
  source: 'unsplash' | 'pexels';
  photographer: string;
  photographerUrl: string;
  /** The photo's own page on the source site. */
  sourceUrl: string;
}

/**
 * Attribution collected during the run, keyed by the public image path.
 *
 * Written to a JSON sidecar rather than a database table on purpose: this data
 * exists only while stock photography stands in for the merchant's own, and it
 * should disappear cleanly the moment real product photographs replace it.
 * A table would sit permanently empty instead.
 */
const credits = new Map<string, PhotoCredit>();

function recordCredit(url: string, credit: PhotoCredit): void {
  credits.set(url, credit);
}

/**
 * Which search result to take for a given image slot.
 *
 * Always taking the first hit meant a product's three gallery images were the
 * same photograph three times - invisible while the artwork was generated per
 * slot, glaring the moment real photos arrived. Derived from the storage key
 * so it stays deterministic across runs.
 */
function pickIndex(key: string, count: number): number {
  if (count <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % count;
}

async function fetchBytes(url: string, headers: Record<string, string> = {}): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(url, { signal: controller.signal, headers, redirect: 'follow' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1024 ? buf : null;
  } catch {
    return null;
  }
}

/** Keyword-matched photo via the Unsplash API. Returns null without a key. */
async function unsplashPhoto(
  query: string,
  w: number,
  h: number,
  slotKey: string,
): Promise<SourcedPhoto | null> {
  if (!UNSPLASH_KEY) return null;
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=${h > w ? 'portrait' : 'landscape'}`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      results?: Array<{
        urls?: { raw?: string };
        links?: { html?: string; download_location?: string };
        user?: { name?: string; links?: { html?: string } };
      }>;
    };
    const results = body.results ?? [];
    const photo = results[pickIndex(slotKey, results.length)];
    const raw = photo?.urls?.raw;
    if (!raw) return null;

    // Required by the Unsplash API Guidelines: ping download_location whenever
    // a photo is actually used, not merely searched for. It returns nothing
    // useful - its only job is to credit the photographer with the usage,
    // which is how they show reach and get hired. Skipping it is grounds for
    // having the API key revoked.
    if (photo.links?.download_location) {
      await fetch(photo.links.download_location, {
        headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
      }).catch(() => undefined);
    }

    const bytes = await fetchBytes(`${raw}&w=${w}&h=${h}&fit=crop&q=80&fm=jpg`);
    if (!bytes) return null;

    return {
      bytes,
      credit: {
        source: 'unsplash',
        photographer: photo.user?.name ?? 'Unknown',
        photographerUrl: photo.user?.links?.html ?? 'https://unsplash.com',
        sourceUrl: photo.links?.html ?? 'https://unsplash.com',
      },
    };
  } catch {
    return null;
  }
}

/**
 * Keyword-matched photo via the Pexels API. Returns null without a key.
 *
 * Same shape as the Unsplash path, and the fallback while an Unsplash
 * application sits in review - a Pexels key is issued immediately. Pexels has
 * no download-tracking endpoint, so attribution is the whole obligation here.
 */
async function pexelsPhoto(
  query: string,
  w: number,
  h: number,
  slotKey: string,
): Promise<SourcedPhoto | null> {
  if (!PEXELS_KEY) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=${h > w ? 'portrait' : 'landscape'}`,
      { headers: { Authorization: PEXELS_KEY } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      photos?: Array<{
        url?: string;
        photographer?: string;
        photographer_url?: string;
        src?: { original?: string };
      }>;
    };
    const photos = body.photos ?? [];
    const photo = photos[pickIndex(slotKey, photos.length)];
    const original = photo?.src?.original;
    if (!original) return null;

    // Pexels serves resized derivatives from the original via query params.
    const bytes = await fetchBytes(`${original}?auto=compress&cs=tinysrgb&w=${w}&h=${h}&fit=crop`);
    if (!bytes) return null;

    return {
      bytes,
      credit: {
        source: 'pexels',
        photographer: photo.photographer ?? 'Unknown',
        photographerUrl: photo.photographer_url ?? 'https://www.pexels.com',
        sourceUrl: photo.url ?? 'https://www.pexels.com',
      },
    };
  } catch {
    return null;
  }
}

/**
 * Deterministic photo from Lorem Picsum - no key, but subject is arbitrary.
 *
 * The seed must be a bare slug: passing the storage key straight through left
 * an encoded slash and a trailing ".svg", which Picsum reads as a format hint
 * and answers with 404. Every download silently fell back to generated art.
 */
async function picsumPhoto(seed: string, w: number, h: number): Promise<Buffer | null> {
  const slug = seed.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/gi, '-');
  return fetchBytes(`https://picsum.photos/seed/${slug}/${w}/${h}`);
}

/**
 * Product silhouettes for the placeholder artwork.
 *
 * There is no real photography in this repository - a boutique supplies its
 * own, and shipping stock photos would mean licensing we do not have. Flat
 * colour blocks read as "unfinished", so each placeholder draws a recognisable
 * silhouette of the actual product type instead. Swapping in real photography
 * needs no code change: upload through the admin console, or point
 * STORAGE_DRIVER at S3 and set the image URLs.
 */
const SILHOUETTES: Record<string, string> = {
  dress:
    'M38 22 L44 18 Q50 22 56 18 L62 22 L58 34 L60 44 Q50 48 40 44 L42 34 Z M40 44 Q50 48 60 44 L68 82 Q50 88 32 82 Z',
  scarf:
    'M34 16 Q50 24 66 16 L70 24 Q50 34 30 24 Z M30 24 Q38 50 34 84 L44 84 Q46 52 40 28 Z M70 24 Q62 50 66 84 L56 84 Q54 52 60 28 Z',
  sweater:
    'M36 26 L46 22 Q50 26 54 22 L64 26 L74 38 L68 46 L62 40 L62 76 Q50 80 38 76 L38 40 L32 46 L26 38 Z',
  blouse:
    'M37 26 L46 22 Q50 27 54 22 L63 26 L72 38 L67 45 L62 39 L62 72 Q50 76 38 72 L38 39 L33 45 L28 38 Z',
  jacket:
    'M36 24 L46 20 L50 32 L54 20 L64 24 L74 38 L68 46 L63 40 L63 80 L37 80 L37 40 L32 46 L26 38 Z M50 32 L50 80',
  bag:
    'M36 40 L64 40 L68 82 L32 82 Z M42 40 Q42 24 50 24 Q58 24 58 40',
  beanie:
    'M30 56 Q30 26 50 26 Q70 26 70 56 Z M26 56 L74 56 L74 68 L26 68 Z',
  earrings:
    'M38 30 A10 10 0 1 1 38 30.1 M38 40 A12 14 0 1 0 38 68 A12 14 0 1 0 38 40 M62 30 A10 10 0 1 1 62 30.1 M62 40 A12 14 0 1 0 62 68 A12 14 0 1 0 62 40',
  mug:
    'M32 36 L62 36 L60 78 Q46 82 34 78 Z M62 44 Q76 44 76 55 Q76 66 62 66',
  throw:
    'M24 40 Q50 32 76 40 L76 52 Q50 44 24 52 Z M24 56 Q50 48 76 56 L76 68 Q50 60 24 68 Z',
};

/**
 * Relative luminance of a hex colour (WCAG formula).
 * Used to pick a silhouette ink that stays visible: some palettes are
 * near-white on near-white, where a white silhouette disappears entirely.
 */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Pick the silhouette that matches the product name. */
function silhouetteFor(label: string): string | null {
  const name = label.toLowerCase();
  if (name.includes('dress')) return SILHOUETTES.dress;
  if (name.includes('scarf')) return SILHOUETTES.scarf;
  if (name.includes('sweater')) return SILHOUETTES.sweater;
  if (name.includes('blouse')) return SILHOUETTES.blouse;
  if (name.includes('jacket')) return SILHOUETTES.jacket;
  if (name.includes('tote') || name.includes('crossbody') || name.includes('bag')) return SILHOUETTES.bag;
  if (name.includes('beanie')) return SILHOUETTES.beanie;
  if (name.includes('earring')) return SILHOUETTES.earrings;
  if (name.includes('mug')) return SILHOUETTES.mug;
  if (name.includes('throw')) return SILHOUETTES.throw;
  return null;
}

async function writePlaceholder(
  key: string,
  label: string,
  _sub: string,
  palette: [string, string],
  variant: 'product' | 'category' | 'banner' = 'product',
  photoQuery?: string,
): Promise<string> {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // A stable hash varies the composition so a grid never looks like one tile
  // repeated.
  let hash = 0;
  const seed = `${key}|${label}|${palette.join(',')}`;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const angle = 20 + (hash % 50);
  const glowX = 34 + (hash % 33);
  const glowY = 26 + ((hash >> 3) % 26);
  const arc = 62 + ((hash >> 9) % 18);

  const [deep, light] = palette;
  const size =
    variant === 'banner' ? { w: 1600, h: 900 }
    : variant === 'category' ? { w: 1200, h: 675 }
    : { w: 800, h: 1000 };

  // Try a real photograph first when one is configured.
  if (IMAGE_SOURCE !== 'generated') {
    const query = photoQuery ?? label;
    photoAttempts += 1;

    // Picsum needs no key and carries no attribution, so it is normalised into
    // the same shape with an empty credit rather than special-cased below.
    const sourced: SourcedPhoto | null =
      IMAGE_SOURCE === 'unsplash' ? await unsplashPhoto(query, size.w, size.h, key)
      : IMAGE_SOURCE === 'pexels' ? await pexelsPhoto(query, size.w, size.h, key)
      : await picsumPhoto(key, size.w, size.h).then((bytes) =>
          bytes ? { bytes, credit: null as unknown as PhotoCredit } : null,
        );

    if (sourced) {
      photoSuccesses += 1;
      const digest = createHash('sha1').update(sourced.bytes).digest('hex').slice(0, 8);
      const stamped = key.replace(/\.svg$/, `-${digest}.jpg`);
      const target = join(UPLOAD_ROOT, stamped);
      await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(target, sourced.bytes);
      const url = `${process.env.STORAGE_PUBLIC_BASE_URL ?? '/static'}/${stamped}`;
      if (sourced.credit) recordCredit(url, sourced.credit);
      return url;
    }
    // Fall through to generated artwork rather than leaving no image.
  }

  const shape = variant === 'product' ? silhouetteFor(label) : null;

  // Contrast-aware ink. On a pale palette a white silhouette is invisible, so
  // switch to a warm near-black; on a dark palette keep it light.
  const isPale = luminance(deep) > 0.55;
  const ink = isPale ? '#2d2a26' : '#ffffff';
  const fillOpacity = isPale ? 0.1 : 0.28;
  const strokeOpacity = isPale ? 0.3 : 0.42;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size.w}" height="${size.h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(label)}">
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="100%" stop-color="${deep}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${glowX}%" cy="${glowY}%" r="62%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bg)"/>
  <circle cx="${glowX}" cy="${glowY}" r="42" fill="url(#glow)"/>
  <path d="M0 ${arc} Q 50 ${arc - 16} 100 ${arc + 6} L100 100 L0 100 Z" fill="${deep}" opacity="0.14"/>
${shape ? `  <path d="${shape}" fill="${ink}" fill-opacity="${fillOpacity}" stroke="${ink}" stroke-opacity="${strokeOpacity}" stroke-width="0.9" stroke-linejoin="round" fill-rule="evenodd"/>` : ''}
</svg>`;

  // Content-addressed filename, hashed from the finished SVG rather than from
  // its inputs. Hashing the inputs is not enough: changing how the artwork is
  // drawn (colours, opacity, shapes) leaves the inputs identical, so the URL
  // would stay the same and every browser and CDN would keep serving the old
  // render. Hashing the output means any visual change is a new URL.
  const digest = createHash('sha1').update(svg).digest('hex').slice(0, 8);
  const stamped = key.replace(/\.svg$/, `-${digest}.svg`);
  const target = join(UPLOAD_ROOT, stamped);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, svg, 'utf8');

  // Relative on purpose - see the /static rewrite in next.config.mjs.
  return `${process.env.STORAGE_PUBLIC_BASE_URL ?? '/static'}/${stamped}`;
}

async function reset(): Promise<void> {
  log('Wiping existing data...');
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'
  `;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  if (tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

async function seedRoles() {
  log('Seeding roles and permissions...');
  const roles: Record<string, string> = {};
  for (const name of Object.values(ROLES)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { permissions: ROLE_PERMISSIONS[name] },
      create: {
        name,
        description: `${name} role`,
        permissions: ROLE_PERMISSIONS[name],
        isSystem: true,
      },
    });
    roles[name] = role.id;
  }
  return roles;
}

async function seedUsers(roles: Record<string, string>) {
  log('Seeding accounts...');
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@boutique.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const customerEmail = process.env.SEED_CUSTOMER_EMAIL ?? 'customer@boutique.local';
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? 'Customer@12345';

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, ROUNDS),
      firstName: 'Store',
      lastName: 'Administrator',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      roleId: roles[ROLES.ADMIN],
      wishlist: { create: {} },
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@boutique.local' },
    update: {},
    create: {
      email: 'manager@boutique.local',
      passwordHash: await bcrypt.hash('Manager@12345', ROUNDS),
      firstName: 'Priya',
      lastName: 'Menon',
      emailVerified: true,
      roleId: roles[ROLES.MANAGER],
      wishlist: { create: {} },
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: customerEmail },
    update: {},
    create: {
      email: customerEmail,
      passwordHash: await bcrypt.hash(customerPassword, ROUNDS),
      firstName: 'Ada',
      lastName: 'Sharma',
      phone: '+919876543210',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      roleId: roles[ROLES.CUSTOMER],
      wishlist: { create: {} },
      addresses: {
        create: {
          label: 'Home',
          fullName: 'Ada Sharma',
          phone: '+919876543210',
          line1: '14 Richmond Road',
          line2: 'Apartment 5B',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560025',
          country: 'IN',
          isDefaultShipping: true,
          isDefaultBilling: true,
        },
      },
    },
  });

  log(`   admin:    ${adminEmail} / ${adminPassword}`);
  log(`   manager:  manager@boutique.local / Manager@12345`);
  log(`   customer: ${customerEmail} / ${customerPassword}`);
  return { admin, manager, customer };
}

async function seedCategories() {
  log('Seeding categories...');
  const bySlug: Record<string, string> = {};
  let position = 0;

  for (const parent of CATEGORIES) {
    const created = await prisma.category.upsert({
      where: { slug: parent.slug },
      update: {},
      create: {
        name: parent.name,
        slug: parent.slug,
        description: `${parent.name} collection`,
        position: position++,
        isActive: true,
        imageUrl: await writePlaceholder(
          `categories/${parent.slug}.svg`,
          parent.name,
          'Collection',
          ['#8b5a3c', '#f0e6da'],
          'category',
        ),
      },
    });
    bySlug[parent.slug] = created.id;

    let childPosition = 0;
    for (const child of parent.children) {
      const createdChild = await prisma.category.upsert({
        where: { slug: child.slug },
        update: {},
        create: {
          name: child.name,
          slug: child.slug,
          parentId: created.id,
          position: childPosition++,
          isActive: true,
          imageUrl: await writePlaceholder(
            `categories/${child.slug}.svg`,
            child.name,
            parent.name,
            ['#a67c52', '#f5eee5'],
            'category',
          ),
        },
      });
      bySlug[child.slug] = createdChild.id;
    }
  }
  return bySlug;
}

async function seedAttributes() {
  log('Seeding product attributes...');
  const defs: Array<{ name: string; type: AttributeType; position: number }> = [
    { name: 'Size', type: AttributeType.SIZE, position: 0 },
    { name: 'Colour', type: AttributeType.COLOR, position: 1 },
    { name: 'Material', type: AttributeType.MATERIAL, position: 2 },
  ];
  for (const def of defs) {
    await prisma.productAttribute.upsert({
      where: { name: def.name },
      update: {},
      create: def,
    });
  }
}

async function resolveAttributeValue(attributeName: string, value: string, hexColor?: string) {
  const attribute = await prisma.productAttribute.upsert({
    where: { name: attributeName },
    update: {},
    create: { name: attributeName, type: AttributeType.OTHER },
  });
  const slug = slugify(`${attributeName}-${value}`);
  const attributeValue = await prisma.productAttributeValue.upsert({
    where: { attributeId_slug: { attributeId: attribute.id, slug } },
    update: hexColor ? { hexColor } : {},
    create: { attributeId: attribute.id, value, slug, hexColor: hexColor ?? null },
  });
  return attributeValue.id;
}

async function seedProducts(categories: Record<string, string>) {
  log(`Seeding ${PRODUCTS.length} products with variants and stock...`);
  const missingKey =
    (IMAGE_SOURCE === 'unsplash' && !UNSPLASH_KEY) || (IMAGE_SOURCE === 'pexels' && !PEXELS_KEY);
  log(
    `   image source: ${IMAGE_SOURCE}${missingKey ? ` (no API key set - will fall back to generated)` : ''}`,
  );
  const created: Array<{ id: string; variantIds: string[] }> = [];

  for (const [index, def] of PRODUCTS.entries()) {
    const categoryId = categories[def.category];
    if (!categoryId) throw new Error(`Seed category "${def.category}" is missing`);

    const slug = slugify(def.name);
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (existing) {
      created.push({ id: existing.id, variantIds: [] });
      continue;
    }

    const skuRoot = `BQ-${slug.toUpperCase().slice(0, 12).replace(/-+$/, '')}`;
    const classification = classify(def.category, def.price);

    const product = await prisma.product.create({
      data: {
        name: def.name,
        slug,
        description: def.description,
        shortDescription: def.shortDescription,
        categoryId,
        brand: def.brand,
        status: ProductStatus.ACTIVE,
        isFeatured: def.featured ?? false,
        isNewArrival: def.newArrival ?? false,
        basePrice: new Prisma.Decimal(def.price),
        compareAtPrice: def.compareAt ? new Prisma.Decimal(def.compareAt) : null,
        hsnCode: classification.hsnCode,
        // Rate follows the HSN classification, not a flat guess. Apparel is
        // rated on the price per piece, so this is resolved per product.
        taxRatePercent: new Prisma.Decimal(classification.gstRate),
        tags: [...def.tags, slugify(def.material)],
        seoTitle: `${def.name} | Boutique`,
        seoDescription: def.shortDescription,
        publishedAt: new Date(Date.now() - (PRODUCTS.length - index) * 24 * 3600 * 1000),
        createdAt: new Date(Date.now() - (PRODUCTS.length - index) * 24 * 3600 * 1000),
      },
    });

    // Gallery images
    for (let i = 0; i < 3; i += 1) {
      const url = await writePlaceholder(
        `products/${slug}-${i + 1}.svg`,
        // Full name, never truncated: it is matched against product keywords to
        // pick the silhouette, and clipping it to 24 chars silently dropped the
        // keyword for longer names ("…Poplin Bl…" no longer contains "blouse").
        def.name,
        i === 0 ? def.brand : `View ${i + 1}`,
        i === 0 ? def.palette : [def.palette[1], def.palette[0]],
        'product',
        def.photoQuery ?? def.name,
      );
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url,
          thumbnailUrl: url,
          alt: `${def.name} - view ${i + 1}`,
          position: i,
          isPrimary: i === 0,
          width: 800,
          height: 1000,
        },
      });
    }

    const variantIds: string[] = [];
    for (const [vIndex, v] of def.variants.entries()) {
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: `${skuRoot}-${v.suffix}`.slice(0, 60),
          name: v.attributes.map((a) => a.value).join(' / '),
          price: new Prisma.Decimal(def.price + (v.priceDelta ?? 0)),
          discountPrice: def.compareAt ? new Prisma.Decimal(def.price + (v.priceDelta ?? 0)) : null,
          costPrice: new Prisma.Decimal(Math.round(def.price * 0.42)),
          weightGrams: 300,
          position: vIndex,
          inventory: { create: { quantity: v.stock, lowStockThreshold: 5 } },
        },
        include: { inventory: true },
      });
      variantIds.push(variant.id);

      if (variant.inventory) {
        await prisma.inventoryHistory.create({
          data: {
            inventoryId: variant.inventory.id,
            changeType: 'RESTOCK',
            quantityBefore: 0,
            quantityChange: v.stock,
            quantityAfter: v.stock,
            reason: 'Opening stock',
            referenceType: 'SEED',
          },
        });
      }

      for (const attr of v.attributes) {
        const attributeValueId = await resolveAttributeValue(attr.attributeName, attr.value, attr.hexColor);
        await prisma.variantAttributeValue.create({
          data: { variantId: variant.id, attributeValueId },
        });
      }
      // Material is a product-level facet, attached to every variant.
      const materialValueId = await resolveAttributeValue('Material', def.material);
      await prisma.variantAttributeValue.create({
        data: { variantId: variant.id, attributeValueId: materialValueId },
      });
    }

    created.push({ id: product.id, variantIds });
  }
  return created;
}

async function seedCoupons() {
  log('Seeding coupons...');
  for (const c of COUPONS) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        description: c.description,
        type: c.type,
        value: new Prisma.Decimal(c.value),
        minOrderValue: new Prisma.Decimal(c.minOrderValue),
        maxDiscountAmount: 'maxDiscountAmount' in c && c.maxDiscountAmount
          ? new Prisma.Decimal(c.maxDiscountAmount as number)
          : null,
        usageLimitPerUser: c.usageLimitPerUser,
        usageLimit: 1000,
        isActive: !('expired' in c && c.expired),
        startsAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        expiresAt:
          'expired' in c && c.expired
            ? new Date(Date.now() - 24 * 3600 * 1000)
            : new Date(Date.now() + 180 * 24 * 3600 * 1000),
      },
    });
  }
}

async function seedBanners() {
  log('Seeding homepage banners...');
  const banners = [
    {
      title: 'The Autumn Atelier',
      subtitle: 'Hand-finished pieces, made in small batches',
      placement: 'HOME_HERO' as const,
      ctaText: 'Shop the collection',
      linkUrl: '/products?sort=newest',
      palette: ['#8b5a3c', '#f0e2d0'] as [string, string],
      position: 0,
    },
    {
      title: 'Silk, Rolled by Hand',
      subtitle: 'Forty minutes of handwork in every scarf',
      placement: 'HOME_HERO' as const,
      ctaText: 'Explore scarves',
      linkUrl: '/category/scarves',
      palette: ['#6b7355', '#e8eadd'] as [string, string],
      position: 1,
    },
    {
      title: 'Free shipping over ₹1,999',
      subtitle: 'Dispatched within 24 hours',
      placement: 'HOME_PROMO' as const,
      ctaText: 'Start shopping',
      linkUrl: '/products',
      palette: ['#3b4a6b', '#dfe5f0'] as [string, string],
      position: 0,
    },
  ];

  for (const b of banners) {
    const existing = await prisma.banner.findFirst({ where: { title: b.title } });
    if (existing) continue;
    await prisma.banner.create({
      data: {
        title: b.title,
        subtitle: b.subtitle,
        placement: b.placement,
        ctaText: b.ctaText,
        linkUrl: b.linkUrl,
        position: b.position,
        isActive: true,
        imageUrl: await writePlaceholder(
          `banners/${slugify(b.title)}.svg`,
          b.title,
          b.subtitle,
          b.palette,
          'banner',
        ),
      },
    });
  }
}

async function seedSettings() {
  const settings: Array<[string, unknown]> = [
    ['store.name', 'Boutique'],
    ['store.currency', 'INR'],
    ['store.supportEmail', 'support@boutique.local'],
    ['store.supportPhone', '+91 80 4000 1234'],
    ['shipping.freeThreshold', 1999],
    ['store.announcement', 'Complimentary shipping on orders over ₹1,999'],
  ];
  for (const [key, value] of settings) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }
}

/**
 * Historical orders so the dashboard, best-seller list and reports render with
 * real numbers rather than empty states.
 */
async function seedOrders(customerId: string) {
  log('Seeding historical orders...');
  const existing = await prisma.order.count();
  if (existing > 0) {
    log('   orders already present, skipping');
    return;
  }

  const variants = await prisma.productVariant.findMany({
    take: 40,
    include: { product: { select: { id: true, name: true, categoryId: true, taxRatePercent: true } }, inventory: true },
  });
  if (!variants.length) return;

  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    include: { addresses: true },
  });
  const address = customer?.addresses[0];
  if (!address) return;

  const addressSnapshot = {
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };

  const statuses: Array<{ status: OrderStatus; payment: PaymentStatus }> = [
    { status: OrderStatus.DELIVERED, payment: PaymentStatus.CAPTURED },
    { status: OrderStatus.DELIVERED, payment: PaymentStatus.CAPTURED },
    { status: OrderStatus.SHIPPED, payment: PaymentStatus.CAPTURED },
    { status: OrderStatus.PROCESSING, payment: PaymentStatus.CAPTURED },
    { status: OrderStatus.PAYMENT_CONFIRMED, payment: PaymentStatus.CAPTURED },
    { status: OrderStatus.CANCELLED, payment: PaymentStatus.FAILED },
  ];

  for (let i = 0; i < 26; i += 1) {
    const daysAgo = Math.floor((i / 26) * 29);
    const placedAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000 - i * 3600 * 1000);
    const pick = statuses[i % statuses.length];
    const lineCount = 1 + (i % 3);

    const chosen = Array.from({ length: lineCount }, (_, k) => variants[(i * 3 + k) % variants.length]);

    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    const items = chosen.map((v) => {
      const quantity = 1 + ((i + Number(v.position)) % 2);
      const unitPrice = v.discountPrice ?? v.price;
      const lineSubtotal = unitPrice.mul(quantity);
      const tax = lineSubtotal.mul(v.product.taxRatePercent).div(100).toDecimalPlaces(2);
      subtotal = subtotal.add(lineSubtotal);
      taxTotal = taxTotal.add(tax);
      return {
        productId: v.product.id,
        variantId: v.id,
        sku: v.sku,
        productName: v.product.name,
        variantName: v.name,
        unitPrice,
        quantity,
        discountAmount: new Prisma.Decimal(0),
        taxAmount: tax,
        lineTotal: lineSubtotal.add(tax),
      };
    });

    const shipping = subtotal.greaterThanOrEqualTo(1999) ? new Prisma.Decimal(0) : new Prisma.Decimal(99);
    const grandTotal = subtotal.add(taxTotal).add(shipping);

    await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(placedAt),
        userId: customerId,
        status: pick.status,
        paymentStatus: pick.payment,
        subtotal,
        taxTotal,
        shippingTotal: shipping,
        discountTotal: new Prisma.Decimal(0),
        grandTotal,
        shippingAddress: addressSnapshot as never,
        billingAddress: addressSnapshot as never,
        placedAt,
        createdAt: placedAt,
        items: { create: items },
        statusHistory: { create: { toStatus: pick.status, note: 'Seeded historical order', createdAt: placedAt } },
        ...(pick.payment === PaymentStatus.CAPTURED
          ? {
              payments: {
                create: {
                  provider: 'RAZORPAY',
                  providerOrderId: `order_seed_${i}`,
                  providerPaymentId: `pay_seed_${i}`,
                  status: PaymentStatus.CAPTURED,
                  amount: grandTotal,
                  method: 'card',
                  capturedAt: placedAt,
                  createdAt: placedAt,
                },
              },
            }
          : {}),
      },
    });

    // Keep totalSold consistent with the orders we just wrote.
    if (pick.payment === PaymentStatus.CAPTURED) {
      for (const item of items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: { totalSold: { increment: item.quantity } },
        });
      }
    }
  }
  log('   26 historical orders created');
}

/**
 * Drop every cached key.
 *
 * Without this, re-seeding leaves Redis holding the previous dataset - the
 * category tree, product listings and homepage all keep serving IDs that no
 * longer exist, and the admin console submits dangling references.
 */
async function flushCache(): Promise<void> {
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'boutique:*', 'COUNT', 500);
      cursor = next;
      if (keys.length) {
        await redis.del(...keys);
        removed += keys.length;
      }
    } while (cursor !== '0');
    log(`Cache flushed (${removed} keys)`);
  } catch (err) {
    log(`Cache flush skipped: ${(err as Error).message}`);
  } finally {
    redis.disconnect();
  }
}

/**
 * Write the attribution sidecar next to the images it describes.
 *
 * Rewritten from scratch on every run, and deleted when nothing needs
 * crediting, so it can never outlive the stock photography it refers to. The
 * API serves it read-only; nothing writes it at runtime.
 */
async function writeCredits(): Promise<void> {
  const target = join(UPLOAD_ROOT, 'image-credits.json');

  if (credits.size === 0) {
    await rm(target, { force: true });
    return;
  }

  await mkdir(UPLOAD_ROOT, { recursive: true });
  await writeFile(
    target,
    `${JSON.stringify(
      {
        note:
          'Attribution for stock photography used as demo imagery. ' +
          'Delete this file when real product photography replaces it.',
        generatedAt: new Date().toISOString(),
        credits: Object.fromEntries([...credits.entries()].sort(([a], [b]) => a.localeCompare(b))),
      },
      null,
      2,
    )}\n`,
  );
  log(`Credits: ${credits.size} photograph(s) attributed in uploads/image-credits.json`);
}

async function main(): Promise<void> {
  console.log('\n=== Boutique Commerce :: database seed ===\n');
  if (RESET) await reset();

  const roles = await seedRoles();
  const users = await seedUsers(roles);

  if (MINIMAL) {
    log('Minimal mode - skipping catalogue');
    await flushCache();
    console.log('\nSeed complete.\n');
    return;
  }

  const categories = await seedCategories();
  await seedAttributes();
  await seedProducts(categories);
  await seedCoupons();
  await seedBanners();
  await seedSettings();
  await seedOrders(users.customer.id);

  if (photoAttempts > 0) {
    log(`Photos: ${photoSuccesses}/${photoAttempts} downloaded, ${photoAttempts - photoSuccesses} fell back to generated art`);
  }
  await writeCredits();

  await flushCache();

  const [products, variants, orders] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.order.count(),
  ]);
  console.log(`\nSeed complete: ${products} products, ${variants} variants, ${orders} orders.\n`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
