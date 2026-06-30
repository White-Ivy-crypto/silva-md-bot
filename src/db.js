const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

class DB {
  constructor(dbPath) {
    ensureDir(path.dirname(dbPath));
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  init() {
    const m = this.db;
    m.serialize(() => {
      m.run(`CREATE TABLE IF NOT EXISTS message_counts (
        id TEXT PRIMARY KEY,
        name TEXT,
        count INTEGER DEFAULT 0
      )`);

      m.run(`CREATE TABLE IF NOT EXISTS warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT,
        timestamp INTEGER
      )`);

      m.run(`CREATE TABLE IF NOT EXISTS muted (
        user TEXT PRIMARY KEY,
        muted_at INTEGER
      )`);

    });
  }

  incrementMessageCount(id, name) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO message_counts (id, name, count) VALUES(?,?,1)
        ON CONFLICT(id) DO UPDATE SET count = count + 1, name = excluded.name;`,
        [id, name],
        function (err) {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  getTopMembers(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT id, name, count FROM message_counts ORDER BY count DESC LIMIT ?`, [limit], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  addWarning(user) {
    const now = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(`INSERT INTO warnings (user, timestamp) VALUES(?,?)`, [user, now], function (err) {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  getWarningsSince(user, sinceMs) {
    const cutoff = Date.now() - sinceMs;
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM warnings WHERE user = ? AND timestamp >= ?`, [user, cutoff], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  muteUser(user) {
    const now = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(`INSERT OR REPLACE INTO muted (user, muted_at) VALUES(?,?)`, [user, now], function (err) {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  unmuteUser(user) {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM muted WHERE user = ?`, [user], function (err) {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  isMuted(user) {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT user FROM muted WHERE user = ?`, [user], (err, row) => {
        if (err) return reject(err);
        resolve(!!row);
      });
    });
  }
}

module.exports = DB;
