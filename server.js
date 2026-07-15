const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('coches.db');

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function (err, row) {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function initDB() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      shift TEXT NOT NULL,
      driver TEXT NOT NULL,
      passengers TEXT NOT NULL,
      unaiCarrier TEXT,
      notes TEXT,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    )
  `);

  const defaultUsers = ['Joseba','Irati','Pardi','Unai','Asier','Asier30'];
  for (const name of defaultUsers) {
    await run(`INSERT OR IGNORE INTO users (name, active) VALUES (?, 1)`, [name]);
  }
}

app.get('/api/users', async (req, res) => {
  try {
    const users = await all(`SELECT name, active FROM users ORDER BY name`);
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/trips', async (req, res) => {
  try {
    const { month } = req.query;
    let sql = `SELECT * FROM trips ORDER BY date DESC`;
    let params = [];
    if (month) {
      sql = `SELECT * FROM trips WHERE date LIKE ? ORDER BY date DESC`;
      params = [`${month}%`];
    }
    const trips = await all(sql, params);
    res.json(trips);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/trips', async (req, res) => {
  try {
    const {
      id,
      date,
      shift,
      driver,
      passengers,
      unaiCarrier,
      notes,
      createdBy
    } = req.body;

    if (!date || !driver || !createdBy) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    const passengersStr = JSON.stringify(passengers || []);

    if (id) {
      await run(
        `UPDATE trips SET
          date = ?,
          shift = ?,
          driver = ?,
          passengers = ?,
          unaiCarrier = ?,
          notes = ?,
          updatedAt = ?
        WHERE id = ?`,
        [
          date,
          shift,
          driver,
          passengersStr,
          unaiCarrier || '',
          notes || '',
          new Date().toISOString(),
          id
        ]
      );

      const trip = await get(`SELECT * FROM trips WHERE id = ?`, [id]);
      res.json(trip);
    } else {
      const createdAt = new Date().toISOString();
      const result = await run(
        `INSERT INTO trips
          (date, shift, driver, passengers, unaiCarrier, notes, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          date,
          shift,
          driver,
          passengersStr,
          unaiCarrier || '',
          notes || '',
          createdBy,
          createdAt
        ]
      );

      const trip = await get(`SELECT * FROM trips WHERE id = ?`, [result.lastID]);
      res.json(trip);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/trips/:id', async (req, res) => {
  try {
    await run(`DELETE FROM trips WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, active, oldName } = req.body;
    if (!name) return res.status(400).json({ error: 'Falta nombre' });

    if (oldName) {
      await run(`UPDATE users SET name = ?, active = ? WHERE name = ?`, [
        name,
        active ? 1 : 0,
        oldName
      ]);

      await run(`UPDATE trips SET createdBy = ? WHERE createdBy = ?`, [name, oldName]);
      await run(`UPDATE trips SET driver = ? WHERE driver = ?`, [name, oldName]);

      const trips = await all(`SELECT id, passengers FROM trips`);
      for (const t of trips) {
        const p = JSON.parse(t.passengers || '[]');
        const newP = p.map(x => (x === oldName ? name : x));
        await run(`UPDATE trips SET passengers = ? WHERE id = ?`, [
          JSON.stringify(newP),
          t.id
        ]);
      }

      const user = await get(`SELECT name, active FROM users WHERE name = ?`, [name]);
      res.json(user);
    } else {
      const exists = await get(`SELECT 1 FROM users WHERE name = ?`, [name]);
      if (exists) return res.status(400).json({ error: 'Usuario ya existe' });

      await run(`INSERT INTO users (name, active) VALUES (?, 1)`, [name]);
      const user = await get(`SELECT name, active FROM users WHERE name = ?`, [name]);
      res.json(user);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor COCHES en puerto ${PORT}`));
  })
  .catch(err => {
    console.error('Error iniciando DB:', err);
    process.exit(1);
  });
