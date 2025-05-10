// data/database.js
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

// Database file path within the same "data" folder
const dbPath = path.join(__dirname, 'db.sqlite');
const db     = new sqlite3.Database(dbPath, err => {
  if (err) console.error('❌ SQLite error:', err);
  else      console.log('✅ Connected to SQLite at', dbPath);
});

// Initialize tables
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
       id       INTEGER PRIMARY KEY AUTOINCREMENT,
       username TEXT    UNIQUE,
       password TEXT,
       balance  REAL    DEFAULT 0
     )`,
    err => {
      if (err) console.error('❌ Failed to create users table:', err);
      else      console.log('✅ users table is ready');
    }
  );
});

module.exports = db;
