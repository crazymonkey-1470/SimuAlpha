/**
 * database.js
 *
 * PostgreSQL connection pool + migration runner + query helpers.
 *
 * Design:
 *  - Raw SQL (migrations, complex analytics) goes through the `pg` pool here.
 *  - Row-level CRUD in services still uses the supabase-js client
 *    (see services/supabase.js) for consistency with the rest of the codebase.
 *
 * Environment:
 *  - DATABASE_URL:           Postgres connection string (required to enable the pool).
 *                            For Supabase, use the pooled connection string
 *                            (port 6543) in production, direct (5432) for migrations.
 *  - DATABASE_MIGRATE_URL:   Optional. Direct (non-pooled) URL used exclusively for
 *                            migrations. Falls back to DATABASE_URL.
 *  - DATABASE_SSL:           'disable' to turn off TLS (local dev only). Default: on.
 *  - DATABASE_POOL_MAX:      Max pool size. Default 10.
 *
 * When DATABASE_URL is absent the module degrades gracefully: `isEnabled` is false,
 * `query` / `transaction` throw a descriptive error, and `runMigrations` is a no-op
 * that logs a warning. Services that still need to function use supabase-js.
 */

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');
const log = require('./logger').child({ module: 'database' });

const DATABASE_URL       = process.env.DATABASE_URL || null;
const DATABASE_MIGRATE_URL = process.env.DATABASE_MIGRATE_URL || DATABASE_URL;
const POOL_MAX           = parseInt(process.env.DATABASE_POOL_MAX || '10', 10);
const USE_SSL            = process.env.DATABASE_SSL !== 'disable';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION_TABLE = '_migrations';

let pool = null;
if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: USE_SSL ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    // Idle client errors should never crash the process.
    log.error({ err }, 'pg pool idle client error');
  });
} else {
  log.warn('DATABASE_URL not set — pg pool disabled. Raw-SQL paths will no-op.');
}

const isEnabled = () => pool !== null;

/**
 * Run a parameterized query.
 * @param {string} sql    - SQL with $1, $2, ... placeholders.
 * @param {Array}  params - Parameter values.
 * @returns {Promise<pg.QueryResult>}
 */
async function query(sql, params = []) {
  if (!pool) {
    throw new Error('Database not configured (DATABASE_URL missing).');
  }
  const started = Date.now();
  try {
    const result = await pool.query(sql, params);
    const ms = Date.now() - started;
    if (ms > 500) {
      log.warn({ ms, rows: result.rowCount }, 'slow query');
    }
    return result;
  } catch (err) {
    log.error({ err, sql: sql.slice(0, 200) }, 'query failed');
    throw err;
  }
}

/**
 * Run callback inside a BEGIN/COMMIT transaction. Rolls back on throw.
 * @param {(client: pg.PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function transaction(fn) {
  if (!pool) {
    throw new Error('Database not configured (DATABASE_URL missing).');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rbErr) {
      log.error({ rbErr }, 'rollback failed');
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ensure the migration tracking table exists. Called before listing applied
 * migrations. Idempotent.
 */
async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      filename    TEXT        PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      checksum    TEXT
    )
  `);
}

/**
 * Discover *.sql files in the migrations dir, sorted lexicographically.
 * Numeric prefixes (001_, 002_, ...) determine execution order.
 */
function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Run all unapplied migrations. Each migration runs in its own transaction
 * (separate from the others) so a failure in N+1 doesn't roll back N.
 *
 * Safety:
 *  - Uses DATABASE_MIGRATE_URL (direct connection) when provided, because the
 *    Supabase pooler doesn't support all DDL.
 *  - Records filename + sha256 checksum after successful apply.
 *  - Skips files already recorded in _migrations.
 *  - Never drops or mutates existing data — migrations themselves must be
 *    idempotent (CREATE ... IF NOT EXISTS).
 *
 * @returns {Promise<{applied: string[], skipped: string[]}>}
 */
async function runMigrations() {
  if (!DATABASE_MIGRATE_URL) {
    log.warn('DATABASE_URL not set — skipping migrations.');
    return { applied: [], skipped: [], disabled: true };
  }

  const files = listMigrationFiles();
  if (files.length === 0) {
    log.info('No migration files found.');
    return { applied: [], skipped: [] };
  }

  // Dedicated pool for migrations — short-lived, direct connection.
  const migratePool = new Pool({
    connectionString: DATABASE_MIGRATE_URL,
    max: 1,
    connectionTimeoutMillis: 15_000,
    ssl: USE_SSL ? { rejectUnauthorized: false } : false,
  });

  const applied = [];
  const skipped = [];
  const client  = await migratePool.connect();

  try {
    await ensureMigrationTable(client);

    const { rows } = await client.query(
      `SELECT filename FROM ${MIGRATION_TABLE}`
    );
    const appliedSet = new Set(rows.map((r) => r.filename));

    for (const filename of files) {
      if (appliedSet.has(filename)) {
        skipped.push(filename);
        continue;
      }

      const full = path.join(MIGRATIONS_DIR, filename);
      const sql  = fs.readFileSync(full, 'utf8');
      const checksum = require('crypto')
        .createHash('sha256')
        .update(sql)
        .digest('hex');

      log.info({ filename }, 'applying migration');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO ${MIGRATION_TABLE} (filename, checksum) VALUES ($1, $2)`,
          [filename, checksum]
        );
        await client.query('COMMIT');
        applied.push(filename);
        log.info({ filename }, 'migration applied');
      } catch (err) {
        await client.query('ROLLBACK');
        log.error({ err, filename }, 'migration failed — aborting run');
        throw err;
      }
    }
  } finally {
    client.release();
    await migratePool.end();
  }

  log.info({ applied: applied.length, skipped: skipped.length }, 'migrations complete');
  return { applied, skipped };
}

/**
 * Close the pool. Call on graceful shutdown.
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  isEnabled,
  query,
  transaction,
  runMigrations,
  close,
  get pool() { return pool; },
};
