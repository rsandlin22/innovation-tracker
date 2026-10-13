const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const { mergeData } = require('./merge');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

// Railway injects DATABASE_URL, or only DATABASE_PUBLIC_URL when the public
// connection string is the one linked to this service
const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
const pool = new Pool({
  connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : false
});

if (!connectionString) {
  console.error('No DATABASE_URL or DATABASE_PUBLIC_URL set — nothing will be saved.');
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT single_row CHECK (id = 1)
    )
  `);
  // Copy of the data after every save, so lost entries can be recovered
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data_history (
      id       SERIAL PRIMARY KEY,
      data     JSONB NOT NULL,
      saved_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Database ready.');
}

initDb().catch(err => {
  console.error('DB init error (continuing anyway):', err.message);
});

// Reports whether the database is reachable, for diagnosing save problems
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ db: 'ok', configured: !!connectionString });
  } catch (err) {
    res.status(503).json({ db: 'error', configured: !!connectionString, error: err.message });
  }
});

// Load saved data
app.get('/api/data', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM app_data WHERE id = 1');
    res.json(result.rows[0] ? result.rows[0].data : null); // No saved data yet — client will use defaults
  } catch (err) {
    console.error('GET /api/data error:', err.message);
    res.status(500).json({ error: 'Failed to load data.' });
  }
});

// Save data. The client sends the data it started from (base) and its
// current data; only its own changes are merged into the latest saved data,
// so people saving at the same time don't overwrite each other.
const HISTORY_KEEP = 200;
app.post('/api/data', async (req, res) => {
  const { base, data } = req.body || {};
  if (!base || !data) {
    // An old copy of the page still open in someone's browser — saving its
    // whole copy would wipe out other people's changes
    return res.status(409).json({ ok: false, error: 'This page is out of date. Please refresh.' });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const cur = await client.query('SELECT data FROM app_data WHERE id = 1 FOR UPDATE');
    const merged = mergeData(cur.rows[0] ? cur.rows[0].data : null, base, data);
    const json = JSON.stringify(merged);
    await client.query(
      `INSERT INTO app_data (id, data, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`,
      [json]
    );
    await client.query('INSERT INTO app_data_history (data) VALUES ($1)', [json]);
    await client.query(
      'DELETE FROM app_data_history WHERE id <= (SELECT MAX(id) FROM app_data_history) - $1',
      [HISTORY_KEEP]
    );
    await client.query('COMMIT');
    res.json({ ok: true, data: merged });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('POST /api/data error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

app.listen(PORT, () => {
  console.log(`Innovation Tracker running on port ${PORT}`);
});
