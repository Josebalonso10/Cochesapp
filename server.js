// server.js
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir el frontend estático
app.use(express.static(path.join(__dirname, 'public')));

let db;

async function initDB() {
  db = await sqlite3.open('coches.db');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  await db.exec(`
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

  // Usuarios por defecto
  const defaultUsers = ['Joseba','Irati','Pardi','Unai','Asier','Asier30'];
  for (const name of defaultUsers) {
    await db.run(
      `INSERT OR IGNORE INTO users (name, active) VALUES (?, 1)`,
      [name]
    );
  }
}

// Obtener usuarios activos
app.get('/api/users', async (req, res) => {
  const users = await db.all(`SELECT name, active FROM users ORDER BY name`);
  res.json(users);
});

// Obtener viajes (con filtro opcional por mes YYYY-MM)
app.get('/api/trips', async (req, res) => {
  const { month } = req.query;
  let sql = `SELECT * FROM trips ORDER BY date DESC`;
  let params = [];

  if (month) {
    sql = `SELECT * FROM trips WHERE date LIKE ? ORDER BY date DESC`;
    params = [`${month}%`];
  }

  const trips = await db.all(sql, params);
  res.json(trips);
});

// Guardar viaje (nuevo o editar)
app.post('/api/trips', async (req, res) => {
  const {
    id,
    date,
    shift,
    driver,
    passengers,
    unaiCarrier,
    notes,
    createdBy,
    updatedAt
  } = req.body;

  if (!date || !driver || !createdBy) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  const passengersStr = JSON.stringify(passengers || []);

  if (id) {
    // Editar
    await db.run(
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
    const [trip] = await db.all(`SELECT * FROM trips WHERE id = ?`, [id]);
    return res.json(trip);
  } else {
    // Nuevo
    const createdAt = new Date().toISOString();
    const result = await db.run(
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
    const [trip] = await db.all(
      `SELECT * FROM trips WHERE id = ?`,
      [result.lastID]
    );
    return res.json(trip);
  }
});

// Borrar viaje
app.delete('/api/trips/:id', async (req, res) => {
  const { id } = req.params;
  await db.run(`DELETE FROM trips WHERE id = ?`, [id]);
  res.json({ ok: true });
});

// Actualizar usuario (activar/desactivar, renombrar)
app.post('/api/users', async (req, res) => {
  const { name, active, oldName } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Falta nombre' });
  }

  if (oldName) {
    // Editar nombre/estado
    await db.run(
      `UPDATE users SET name = ?, active = ? WHERE name = ?`,
      [name, active ? 1 : 0, oldName]
    );
    // Actualizar también en trips (createdBy, driver, pasajeros, etc.)
    await db.run(`UPDATE trips SET createdBy = ? WHERE createdBy = ?`, [
      name,
      oldName,
    ]);
    await db.run(`UPDATE trips SET driver = ? WHERE driver = ?`, [
      name,
      oldName,
    ]);

    const allTrips = await db.all(`SELECT id, passengers FROM trips`);
    for (const t of allTrips) {
      try {
        const p = JSON.parse(t.passengers || '[]');
        const newP = p.map(x => (x === oldName ? name : x));
        await db.run(`UPDATE trips SET passengers = ? WHERE id = ?`, [
          JSON.stringify(newP),
          t.id,
        ]);
      } catch {}
    }

    const [user] = await db.all(`SELECT name, active FROM users WHERE name = ?`, [
      name,
    ]);
    return res.json(user);
  } else {
    // Nuevo usuario
    const exists = await db.get(`SELECT 1 FROM users WHERE name = ?`, [name]);
    if (exists) {
      return res.status(400).json({ error: 'Usuario ya existe' });
    }
    await db.run(`INSERT INTO users (name, active) VALUES (?, 1)`, [name]);
    const [user] = await db.all(`SELECT name, active FROM users WHERE name = ?`, [
      name,
    ]);
    return res.json(user);
  }
});

// Iniciar
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor COCHES escuchando en puerto ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error iniciando DB:', err);
    process.exit(1);
  });
