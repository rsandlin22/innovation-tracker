const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT single_row CHECK (id = 1)
    )
  `);
  console.log('Database ready.');
}

initDb().catch(err => {
  console.error('DB init error (continuing anyway):', err.message);
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

// Save data
app.post('/api/data', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO app_data (id, data, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(req.body)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/data error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Innovation Tracker running on port ${PORT}`);
});
