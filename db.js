const Database = require('better-sqlite3');

const db = new Database(process.env.DB_FILE || 'cyberlearn.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Вбудований LIKE у SQLite ігнорує регістр лише для латиниці,
// тому для пошуку кирилицею реєструємо власну функцію нижнього регістру.
db.function('ulower', { deterministic: true }, s => (s == null ? null : String(s).toLowerCase()));

db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
    lessons INTEGER NOT NULL CHECK (lessons > 0),
    duration TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    seconds INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

if (db.prepare('SELECT COUNT(*) AS n FROM courses').get().n === 0) {
  const add = db.prepare('INSERT INTO courses (title, level, lessons, duration) VALUES (?, ?, ?, ?)');
  [
    ['Основи кібергігієни', 'beginner', 8, '2 год'],
    ['Надійні паролі та 2FA', 'beginner', 6, '1,5 год'],
    ['Фішинг і соціальна інженерія', 'intermediate', 10, '3 год'],
    ['Безпека домашньої мережі', 'intermediate', 9, '2,5 год'],
    ['Основи криптографії', 'advanced', 12, '4 год'],
    ['Тестування вебзастосунків на проникнення', 'advanced', 14, '5 год']
  ].forEach(c => add.run(...c));
}

module.exports = db;
