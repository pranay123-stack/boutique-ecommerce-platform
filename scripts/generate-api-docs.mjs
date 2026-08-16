#!/usr/bin/env node
/**
 * Regenerates docs/API.md from the live OpenAPI document.
 * The API must be running. Usage: node scripts/generate-api-docs.mjs
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const URL = process.env.API_DOCS_URL ?? 'http://localhost:4100/api/v1/docs-json';
console.log(`Fetching ${URL} ...`);
const spec = JSON.parse(execSync(`curl -sf ${URL}`, { encoding: 'utf8' }));
writeFileSync('/tmp/openapi.json', JSON.stringify(spec));
execSync('python3 scripts/_render-api-docs.py', { stdio: 'inherit' });
console.log('docs/API.md regenerated.');
