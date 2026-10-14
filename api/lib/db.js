// api/lib/db.js
// Supabase PostgreSQL connection via pg driver
// Dùng connection pooling an toàn cho Vercel Serverless

import pg from 'pg';
const { Pool } = pg;

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SUPABASE_URL;
    if (!connectionString) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

/**
 * Execute a query against Supabase PostgreSQL
 * @param {string} text - SQL query with $1, $2 placeholders
 * @param {any[]} params - Query parameters
 */
export async function query(text, params = []) {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Initialize database schema (run on first deploy)
 */
export async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id           SERIAL PRIMARY KEY,
      order_id     TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      email        TEXT,
      phone        TEXT,
      cccd         TEXT,
      costume_id   TEXT,
      costume_name TEXT,
      rental_date  TEXT,
      return_date  TEXT,
      deposit      BIGINT DEFAULT 0,
      total        BIGINT DEFAULT 0,
      status       TEXT DEFAULT 'pending',
      notes        TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS paid_orders (
      id           SERIAL PRIMARY KEY,
      order_id     TEXT UNIQUE NOT NULL,
      amount       BIGINT DEFAULT 0,
      content      TEXT,
      gateway      TEXT,
      paid_at      TIMESTAMPTZ DEFAULT NOW(),
      discord_sent BOOLEAN DEFAULT FALSE,
      raw_payload  JSONB
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS otp_requests (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      otp_hash   TEXT NOT NULL,
      order_id   TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('[DB] Schema initialized successfully');
}
