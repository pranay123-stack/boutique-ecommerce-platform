#!/usr/bin/env node
/**
 * Strip statements Prisma emits that Postgres will reject.
 *
 * `products.searchVector` is a GENERATED ALWAYS AS (...) STORED column, which
 * Prisma's schema language cannot express. It therefore reads the generation
 * expression as an ordinary column DEFAULT and writes an
 * `ALTER COLUMN "searchVector" SET/DROP DEFAULT` into every migration it
 * generates - and Postgres rejects both forms on a generated column:
 *
 *     ERROR: column "searchVector" of relation "products" is a generated column
 *
 * There is no way to declare this away in schema.prisma, so the statement is
 * removed here instead of being patched by hand each time (which was already
 * missed twice). Run via `npm run migrate:new -- --name your_migration`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = new URL('../prisma/migrations/', import.meta.url).pathname;

/** Statements that must never reach Postgres, with why. */
const REJECTED = [
  {
    pattern: /^ALTER TABLE "products" ALTER COLUMN "searchVector" (SET|DROP) DEFAULT.*?;\s*$/gms,
    reason: 'searchVector is a generated column; its default cannot be set or dropped',
  },
];

function cleanFile(file) {
  const original = readFileSync(file, 'utf8');
  let cleaned = original;
  const removed = [];

  for (const { pattern, reason } of REJECTED) {
    cleaned = cleaned.replace(pattern, () => {
      removed.push(reason);
      return `-- removed by scripts/clean-migration.mjs: ${reason}\n`;
    });
  }

  if (removed.length) {
    writeFileSync(file, cleaned);
    console.log(`  cleaned ${file}`);
    removed.forEach((r) => console.log(`    - ${r}`));
  }
  return removed.length;
}

const target = process.argv[2];
const dirs = target
  ? [target]
  : readdirSync(MIGRATIONS)
      .map((d) => join(MIGRATIONS, d))
      .filter((d) => statSync(d).isDirectory());

let total = 0;
for (const dir of dirs) {
  const sql = join(dir, 'migration.sql');
  try {
    total += cleanFile(sql);
  } catch {
    /* not a migration directory */
  }
}
console.log(total ? `Removed ${total} unusable statement(s).` : 'Migrations are clean.');
