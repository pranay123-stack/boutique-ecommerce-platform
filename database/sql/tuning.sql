-- ===========================================================================
-- Index health and query analysis
--   psql "$DATABASE_URL" -f database/sql/tuning.sql
-- ===========================================================================

\echo '--- Table sizes ---'
SELECT relname AS table_name,
       pg_size_pretty(pg_total_relation_size(relid)) AS total,
       pg_size_pretty(pg_relation_size(relid))       AS heap,
       pg_size_pretty(pg_indexes_size(relid))        AS indexes,
       n_live_tup                                    AS live_rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

\echo ''
\echo '--- Unused indexes (candidates for removal; ignore on a fresh database) ---'
SELECT s.relname AS table_name, s.indexrelname AS index_name,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
       s.idx_scan AS scans
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisunique              -- unique indexes enforce constraints
  AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC;

\echo ''
\echo '--- Sequential scans on large tables (missing index signal) ---'
SELECT relname AS table_name, seq_scan, seq_tup_read, idx_scan,
       CASE WHEN seq_scan > 0 THEN seq_tup_read / seq_scan ELSE 0 END AS avg_rows_per_seq_scan
FROM pg_stat_user_tables
WHERE n_live_tup > 1000
ORDER BY seq_tup_read DESC
LIMIT 15;

\echo ''
\echo '--- Cache hit ratio (aim for > 0.99 on a warm database) ---'
SELECT sum(heap_blks_hit) AS hits, sum(heap_blks_read) AS reads,
       round(sum(heap_blks_hit)::numeric
             / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 4) AS hit_ratio
FROM pg_statio_user_tables;

\echo ''
\echo '--- Dead tuples (autovacuum pressure) ---'
SELECT relname AS table_name, n_live_tup, n_dead_tup,
       round(n_dead_tup::numeric / NULLIF(n_live_tup, 0), 4) AS dead_ratio,
       last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 100
ORDER BY n_dead_tup DESC
LIMIT 15;

\echo ''
\echo '--- Storefront hot path: live product listing ---'
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, slug, "basePrice"
FROM products
WHERE status = 'ACTIVE' AND "deletedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 12;

\echo ''
\echo '--- Storefront hot path: full-text search ---'
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, ts_rank("searchVector", plainto_tsquery('english', 'silk scarf')) AS rank
FROM products
WHERE status = 'ACTIVE' AND "deletedAt" IS NULL
  AND "searchVector" @@ plainto_tsquery('english', 'silk scarf')
ORDER BY rank DESC
LIMIT 12;
