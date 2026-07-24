import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

// __dirname doesn't exist in ES modules — this is the standard replacement
const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));
const pool = new Pool();

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.up.sql'))
    .map((f) => f.replace(/\.up\.sql$/, ''))
    .sort(); // relies on numeric prefixes (001_, 002_, ...) for ordering
}

async function ensureMigrationsTable(client: import('pg').PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function up() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    for (const name of listMigrations()) {
      if (applied.has(name)) continue;

      const sql = readFileSync(join(MIGRATIONS_DIR, `${name}.up.sql`), 'utf-8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log(`applied: ${name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${name} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
}

async function down(steps = 1) {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const { rows } = await client.query(
      'SELECT name FROM schema_migrations ORDER BY name DESC LIMIT $1',
      [steps]
    );

    for (const { name } of rows) {
      const sql = readFileSync(join(MIGRATIONS_DIR, `${name}.down.sql`), 'utf-8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('DELETE FROM schema_migrations WHERE name = $1', [name]);
        await client.query('COMMIT');
        console.log(`reverted: ${name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`revert of ${name} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
}

async function main() {
  const [, , cmd, arg] = process.argv;
  try {
    if (cmd === 'down') {
      await down(arg ? parseInt(arg, 10) : 1);
    } else {
      await up();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
