-- Runs once on first container start, before Prisma migrations.
-- The migrations create these too (IF NOT EXISTS), so this is belt and braces
-- for environments where the app role lacks CREATE EXTENSION.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gin;
