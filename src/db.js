const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'taskflow.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let _sqlDb = null;

function persist() {
  if (!_sqlDb) return;
  const data = _sqlDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// sql.js uses positional ? params — bind via array
function execSql(sql, params = []) {
  // Convert params to sql.js format (values replace ?)
  _sqlDb.run(sql, params);
  persist();
}

function querySql(sql, params = []) {
  const results = _sqlDb.exec(sql, params);
  if (!results.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => { obj[c] = row[i]; });
    return obj;
  });
}

function getLastId() {
  const r = _sqlDb.exec('SELECT last_insert_rowid()');
  return r[0]?.values[0]?.[0] ?? null;
}

// Mimic synchronous prepare().run() / .get() / .all() API
const db = {
  prepare(sql) {
    return {
      run(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        _sqlDb.run(sql, params);
        const lastInsertRowid = getLastId();
        persist();
        return { lastInsertRowid };
      },
      get(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const results = _sqlDb.exec(sql, params);
        if (!results.length || !results[0].values.length) return undefined;
        const cols = results[0].columns;
        const obj = {};
        cols.forEach((c, i) => { obj[c] = results[0].values[0][i]; });
        return obj;
      },
      all(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const results = _sqlDb.exec(sql, params);
        if (!results.length) return [];
        const cols = results[0].columns;
        return results[0].values.map(row => {
          const obj = {};
          cols.forEach((c, i) => { obj[c] = row[i]; });
          return obj;
        });
      }
    };
  },
  exec(sql) {
    _sqlDb.run(sql);
    persist();
  },
  pragma() {} // no-op
};

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _sqlDb = new SQL.Database(fileBuffer);
  } else {
    _sqlDb = new SQL.Database();
  }

  _sqlDb.run('PRAGMA foreign_keys = ON');

  _sqlDb.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at DATETIME DEFAULT (datetime('now'))
  )`);

  _sqlDb.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    owner_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  _sqlDb.run(`CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  _sqlDb.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    project_id INTEGER NOT NULL,
    assignee_id INTEGER,
    created_by INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date DATE,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  persist();
  console.log('Database initialized at', DB_PATH);
}

module.exports = { db, initDb };
