// Автоматична перевірка REST API: node --test test/
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberlearn-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_KEY = 'test-admin';
const app = require('../server');

let server, base;
before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = async (method, url, body, headers = {}) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
};
const ADMIN = { 'x-admin-key': 'test-admin' };
const course = { title: 'Безпека смартфона', level: 'beginner', lessons: 5, duration: '1 год' };

test('GET /api/courses повертає 6 курсів', async () => {
  const r = await call('GET', '/api/courses');
  assert.equal(r.status, 200);
  assert.equal(r.data.length, 6);
});

test('Пошук кирилицею не залежить від регістру', async () => {
  assert.equal((await call('GET', '/api/courses?q=' + encodeURIComponent('парол'))).data.length, 1);
  assert.equal((await call('GET', '/api/courses?q=' + encodeURIComponent('ОСНОВИ'))).data.length, 2);
});

test('Фільтр за рівнем', async () => {
  const r = await call('GET', '/api/courses?level=advanced');
  assert.equal(r.data.length, 2);
  assert.ok(r.data.every(c => c.level === 'advanced'));
});

test('POST /api/courses без ключа адміна — 403', async () => {
  assert.equal((await call('POST', '/api/courses', course)).status, 403);
});

test('Повний CRUD курсу з ключем адміна', async () => {
  const c = await call('POST', '/api/courses', course, ADMIN);
  assert.equal(c.status, 201);
  const id = c.data.id;
  assert.equal((await call('GET', `/api/courses/${id}`)).data.title, course.title);
  const u = await call('PUT', `/api/courses/${id}`, { ...course, lessons: 7 }, ADMIN);
  assert.equal(u.status, 200);
  assert.equal(u.data.lessons, 7);
  assert.equal((await call('DELETE', `/api/courses/${id}`, null, ADMIN)).status, 204);
  assert.equal((await call('GET', `/api/courses/${id}`)).status, 404);
});

test('Валідація курсу — 400', async () => {
  const r = await call('POST', '/api/courses', { ...course, lessons: 0 }, ADMIN);
  assert.equal(r.status, 400);
});

test('Реєстрація, повтор пошти, вхід, результати', async () => {
  const user = { name: 'Максим', email: 'Test@Example.com', password: 'secret123' };
  assert.equal((await call('POST', '/api/auth/register', user)).status, 201);
  const dup = await call('POST', '/api/auth/register', { ...user, email: 'test@example.com' });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error, 'Користувач з такою поштою вже існує');
  assert.equal((await call('POST', '/api/auth/register', { ...user, email: 'a@b.c', password: 'short' })).status, 400);

  const bad = await call('POST', '/api/auth/login', { email: user.email, password: 'wrong123' });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error, 'Невірна пошта або пароль');

  const ok = await call('POST', '/api/auth/login', { email: user.email, password: user.password });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);
  const auth = { Authorization: 'Bearer ' + ok.data.token };

  assert.equal((await call('POST', '/api/results', { score: 4, total: 5, seconds: 30 })).status, 401);
  assert.equal((await call('POST', '/api/results', { score: 6, total: 5, seconds: 30 }, auth)).status, 400);
  assert.equal((await call('POST', '/api/results', { score: 4, total: 5, seconds: 30 }, auth)).status, 201);
  const me = await call('GET', '/api/results/me', null, auth);
  assert.equal(me.data.length, 1);
  assert.equal(me.data[0].score, 4);
});

test('Паролі зберігаються лише як bcrypt-хеш', () => {
  const db = require('../db');
  const row = db.prepare('SELECT password_hash FROM users LIMIT 1').get();
  assert.match(row.password_hash, /^\$2[aby]\$10\$/);
});

test('Некоректний JSON — 400, невідомий маршрут — 404', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
  assert.equal((await call('GET', '/api/nope')).status, 404);
});
