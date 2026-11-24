require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_KEY = process.env.ADMIN_KEY;

if (!JWT_SECRET || !ADMIN_KEY) {
  console.error('Задайте JWT_SECRET і ADMIN_KEY у змінних середовища');
  process.exit(1);
}

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// На хмарних платформах (Render тощо) застосунок працює за проксі:
// без цього всі користувачі мали б одну IP-адресу для rate limit.
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }));

function requireAdmin(req, res, next) {
  if (req.get('x-admin-key') !== ADMIN_KEY) return res.status(403).json({ error: 'Доступ заборонено' });
  next();
}

function requireUser(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Потрібно увійти' });
  }
}

function validateCourse(b) {
  if (typeof b.title !== 'string' || b.title.trim().length < 3) return 'Назва має містити щонайменше 3 символи';
  if (!LEVELS.includes(b.level)) return 'Невірний рівень';
  if (!Number.isInteger(b.lessons) || b.lessons < 1) return 'Кількість уроків має бути цілим числом більше 0';
  if (typeof b.duration !== 'string' || !b.duration.trim()) return 'Вкажіть тривалість';
  return null;
}

// ----- CRUD курсів -----
app.get('/api/courses', (req, res) => {
  const q = `%${String(req.query.q || '').trim().toLowerCase()}%`;
  const level = req.query.level;
  const rows = LEVELS.includes(level)
    ? db.prepare('SELECT * FROM courses WHERE ulower(title) LIKE ? AND level = ? ORDER BY id').all(q, level)
    : db.prepare('SELECT * FROM courses WHERE ulower(title) LIKE ? ORDER BY id').all(q);
  res.json(rows);
});

app.get('/api/courses/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  row ? res.json(row) : res.status(404).json({ error: 'Курс не знайдено' });
});

app.post('/api/courses', requireAdmin, (req, res) => {
  const err = validateCourse(req.body);
  if (err) return res.status(400).json({ error: err });
  const title = req.body.title.trim();
  const duration = req.body.duration.trim();
  const { level, lessons } = req.body;
  const info = db.prepare('INSERT INTO courses (title, level, lessons, duration) VALUES (?, ?, ?, ?)')
    .run(title, level, lessons, duration);
  res.status(201).json({ id: Number(info.lastInsertRowid), title, level, lessons, duration });
});

app.put('/api/courses/:id', requireAdmin, (req, res) => {
  const err = validateCourse(req.body);
  if (err) return res.status(400).json({ error: err });
  const title = req.body.title.trim();
  const duration = req.body.duration.trim();
  const { level, lessons } = req.body;
  const info = db.prepare('UPDATE courses SET title = ?, level = ?, lessons = ?, duration = ? WHERE id = ?')
    .run(title, level, lessons, duration, req.params.id);
  info.changes
    ? res.json({ id: Number(req.params.id), title, level, lessons, duration })
    : res.status(404).json({ error: 'Курс не знайдено' });
});

app.delete('/api/courses/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
  info.changes ? res.status(204).end() : res.status(404).json({ error: 'Курс не знайдено' });
});

// ----- Реєстрація та вхід -----
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (typeof name !== 'string' || name.trim().length < 2)
    return res.status(400).json({ error: 'Введіть ім’я (щонайменше 2 символи)' });
  if (typeof email !== 'string' || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Невірний формат пошти' });
  if (typeof password !== 'string' || password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
    return res.status(400).json({ error: 'Пароль: щонайменше 8 символів, літери та цифри' });
  const mail = email.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(mail))
    return res.status(409).json({ error: 'Користувач з такою поштою вже існує' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), mail, hash);
  res.status(201).json({ id: Number(info.lastInsertRowid), name: name.trim() });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash))
    return res.status(401).json({ error: 'Невірна пошта або пароль' });
  const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, name: user.name });
});

// ----- Результати тесту -----
app.post('/api/results', requireUser, (req, res) => {
  const { score, total, seconds } = req.body;
  if (![score, total, seconds].every(Number.isInteger) || total < 1 || score < 0 || score > total || seconds < 0)
    return res.status(400).json({ error: 'Невірні дані результату' });
  db.prepare('INSERT INTO results (user_id, score, total, seconds) VALUES (?, ?, ?, ?)')
    .run(req.user.id, score, total, seconds);
  res.status(201).json({ ok: true });
});

app.get('/api/results/me', requireUser, (req, res) => {
  res.json(db.prepare('SELECT score, total, seconds, created_at FROM results WHERE user_id = ? ORDER BY id DESC LIMIT 10').all(req.user.id));
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Маршрут не знайдено' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некоректний JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Завеликий запит' });
  console.error(err);
  res.status(500).json({ error: 'Внутрішня помилка сервера' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`CyberLearn працює на http://localhost:${PORT}`));
}

module.exports = app;
