import { config } from 'dotenv';
// Integration tests run against the isolated boutique_test database.
config({ path: '.env.test' });
process.env.NODE_ENV = 'test';
