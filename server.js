const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

// Load saved data
app.get('/api/data', (req, res) => {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } else {
    res.json(null); // No saved data yet — client will use defaults
  }
});

// Save data
app.post('/api/data', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Innovation Tracker running on port ${PORT}`);
});
