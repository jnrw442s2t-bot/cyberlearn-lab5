const LEVEL_NAMES = { beginner: 'Початковий рівень', intermediate: 'Середній рівень', advanced: 'Просунутий рівень' };

async function api(url, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...options.headers
    }
  });
  let data = null;
  if (res.status !== 204) {
    try { data = await res.json(); } catch { data = null; }
  }
  if (res.status === 401 && token) logout(false);
  if (!res.ok) throw new Error(data?.error || 'Помилка сервера (' + res.status + ')');
  return data;
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function logout(reload = true) {
  localStorage.removeItem('token');
  localStorage.removeItem('userName');
  if (reload) location.reload();
}

// ----- Навігація -----
function initNav() {
  const header = document.querySelector('.header');
  const burger = document.querySelector('.burger');
  if (!header || !burger) return;
  const close = () => { header.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); };
  burger.addEventListener('click', () => {
    const open = header.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
  header.querySelectorAll('nav a').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  const user = localStorage.getItem('userName');
  const slot = document.querySelector('#userSlot');
  if (user && slot) {
    slot.textContent = 'Привіт, ' + user;
    header.querySelectorAll('[data-guest]').forEach(el => el.hidden = true);
    const out = document.createElement('button');
    out.className = 'btn ghost';
    out.type = 'button';
    out.textContent = 'Вийти';
    out.addEventListener('click', () => logout());
    slot.after(out);
  }
}

// ----- Каталог (дані з сервера) -----
function initCatalog() {
  const grid = document.querySelector('#courseGrid');
  if (!grid) return;
  const search = document.querySelector('#search');
  const level = document.querySelector('#level');
  const count = document.querySelector('#count');
  let timer;
  let requestId = 0;

  async function render() {
    const id = ++requestId;
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = '<p class="muted">Завантаження…</p>';
    try {
      const params = new URLSearchParams({ q: search.value, level: level.value });
      const courses = await api('/api/courses?' + params);
      if (id !== requestId) return; // відповідь на застарілий запит
      count.textContent = courses.length;
      grid.innerHTML = courses.length
        ? courses.map(c => `
          <article class="card">
            <span class="badge">${LEVEL_NAMES[c.level] || escapeHtml(c.level)}</span>
            <h3>${escapeHtml(c.title)}</h3>
            <p>${Number(c.lessons)} уроків · ${escapeHtml(c.duration)}</p>
            <button class="btn" type="button" data-id="${Number(c.id)}">Почати</button>
          </article>`).join('')
        : '<p class="muted">Нічого не знайдено. Спробуйте змінити запит.</p>';
    } catch (e) {
      if (id !== requestId) return;
      count.textContent = '0';
      grid.innerHTML = `<p class="error">Не вдалося завантажити курси: ${escapeHtml(e.message)}</p>`;
    } finally {
      if (id === requestId) grid.removeAttribute('aria-busy');
    }
  }

  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 300); });
  level.addEventListener('change', render);
  grid.addEventListener('click', e => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    btn.textContent = 'Продовжити';
    toast('Курс додано до вашого навчання');
  });
  render();
}

// ----- FAQ -----
function initFaq() {
  const faq = document.querySelector('.faq');
  if (!faq) return;
  faq.addEventListener('click', e => {
    const q = e.target.closest('.faq-q');
    if (!q) return;
    const item = q.parentElement;
    const wasOpen = item.classList.contains('open');
    faq.querySelectorAll('.faq-item').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
    });
    if (!wasOpen) { item.classList.add('open'); q.setAttribute('aria-expanded', 'true'); }
  });
}

// ----- Форми -----
const RULES = {
  name: v => v.trim().length >= 2 || 'Введіть ім’я (щонайменше 2 символи)',
  email: v => !v.trim() ? 'Введіть електронну пошту'
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Невірний формат пошти. Приклад: name@example.com',
  password: v => v.length < 8 ? 'Пароль має містити щонайменше 8 символів'
    : (/[a-zA-Z]/.test(v) && /\d/.test(v)) || 'Додайте до пароля латинські літери та цифри',
  loginPassword: v => v.length > 0 || 'Введіть пароль',
  confirm: (v, form) => (v.length > 0 && v === form.querySelector('[data-rule="password"]').value) || 'Паролі не збігаються'
};

function checkField(input) {
  const result = RULES[input.dataset.rule](input.value, input.form);
  const msg = input.parentElement.querySelector('.field-error');
  const ok = result === true;
  input.classList.toggle('invalid', !ok);
  input.classList.toggle('valid', ok);
  input.setAttribute('aria-invalid', String(!ok));
  if (msg) msg.textContent = ok ? '' : result;
  return ok;
}

function initForm() {
  const form = document.querySelector('form[data-api]');
  if (!form) return;
  const fields = [...form.querySelectorAll('[data-rule]')];
  const status = form.querySelector('.form-status');
  fields.forEach(f => {
    f.addEventListener('blur', () => checkField(f));
    f.addEventListener('input', () => { if (f.classList.contains('invalid')) checkField(f); });
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const bad = fields.filter(f => !checkField(f));
    if (bad.length) { bad[0].focus(); return; }
    const body = Object.fromEntries(new FormData(form));
    delete body.confirm;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    status.className = 'form-status';
    status.textContent = 'Надсилання…';
    try {
      const data = await api(form.dataset.api, { method: 'POST', body: JSON.stringify(body) });
      if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userName', data.name);
      }
      status.className = 'form-status success';
      status.textContent = data.token ? 'Вхід виконано' : 'Акаунт створено! Тепер увійдіть.';
      setTimeout(() => location.href = form.dataset.next, 1200);
    } catch (err) {
      status.className = 'form-status error';
      status.textContent = err.message;
      btn.disabled = false;
    }
  });
}

// ----- Тест -----
const QUESTIONS = [
  { q: 'Який пароль найнадійніший?', a: ['12345678', 'qwerty', 'T7#vq!2Lm9pX', 'password'], c: 2 },
  { q: 'Що таке фішинг?', a: ['Вид антивірусу', 'Шахрайське виманювання даних', 'Тип шифрування', 'Мережевий протокол'], c: 1 },
  { q: 'Що дає двофакторна автентифікація?', a: ['Швидший вхід', 'Додатковий рівень захисту', 'Безкоштовний VPN', 'Нічого'], c: 1 },
  { q: 'Який протокол захищає дані на сайті?', a: ['HTTP', 'FTP', 'HTTPS', 'Telnet'], c: 2 },
  { q: 'Що робити з підозрілим вкладенням у листі?', a: ['Відкрити', 'Переслати друзям', 'Не відкривати й видалити', 'Завантажити'], c: 2 }
];

function formatDate(s) {
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d) ? escapeHtml(s) : d.toLocaleString('uk-UA');
}

async function renderHistory(target) {
  if (!localStorage.getItem('token')) return;
  try {
    const rows = await api('/api/results/me');
    target.innerHTML = rows.length
      ? `<h3>Мої останні результати</h3>
         <table class="results">
           <thead><tr><th scope="col">Дата</th><th scope="col">Бали</th><th scope="col">Час</th></tr></thead>
           <tbody>${rows.map(r => `<tr><td>${formatDate(r.created_at)}</td><td>${Number(r.score)} з ${Number(r.total)}</td><td>${Number(r.seconds)} с</td></tr>`).join('')}</tbody>
         </table>`
      : '';
  } catch (e) {
    target.innerHTML = `<p class="error">Не вдалося завантажити історію: ${escapeHtml(e.message)}</p>`;
  }
}

function initQuiz() {
  const box = document.querySelector('#quiz');
  if (!box) return;
  let state, tick;

  function start() {
    state = { i: 0, answers: [], seconds: 0 };
    clearInterval(tick);
    tick = setInterval(() => {
      state.seconds++;
      const t = box.querySelector('#timer');
      if (t) t.textContent = state.seconds + ' с';
    }, 1000);
    show();
  }

  function show() {
    const item = QUESTIONS[state.i];
    const chosen = state.answers[state.i];
    box.innerHTML = `
      <p class="muted">Питання ${state.i + 1} з ${QUESTIONS.length} · <span id="timer">${state.seconds} с</span></p>
      <h2>${escapeHtml(item.q)}</h2>
      <div class="answers">${item.a.map((t, k) => {
        const cls = chosen === undefined ? '' : k === item.c ? 'correct' : k === chosen ? 'wrong' : '';
        return `<button type="button" class="answer ${cls}" data-k="${k}" ${chosen !== undefined ? 'disabled' : ''}>${escapeHtml(t)}</button>`;
      }).join('')}</div>
      <div class="quiz-nav">
        <button type="button" class="btn ghost" id="prev" ${state.i === 0 ? 'disabled' : ''}>Назад</button>
        <button type="button" class="btn" id="next" ${chosen === undefined ? 'disabled' : ''}>${state.i === QUESTIONS.length - 1 ? 'Завершити' : 'Далі'}</button>
      </div>`;
  }

  async function finish() {
    clearInterval(tick);
    const score = state.answers.filter((a, i) => a === QUESTIONS[i].c).length;
    const pct = Math.round(score / QUESTIONS.length * 100);
    box.innerHTML = `
      <h2>Ваш результат: ${pct}%</h2>
      <p>Правильних відповідей: ${score} з ${QUESTIONS.length} · Час: ${state.seconds} с</p>
      <p>${pct >= 80 ? 'Чудово!' : pct >= 50 ? 'Непогано, але є що підтягнути.' : 'Варто повторити матеріал.'}</p>
      <p class="muted" id="saved">Збереження…</p>
      <button type="button" class="btn" id="again">Пройти ще раз</button>
      <div id="history"></div>`;
    const saved = box.querySelector('#saved');
    if (!localStorage.getItem('token')) {
      saved.innerHTML = '<a href="login.html">Увійдіть</a>, щоб зберігати результати.';
      return;
    }
    try {
      await api('/api/results', { method: 'POST', body: JSON.stringify({ score, total: QUESTIONS.length, seconds: state.seconds }) });
      saved.textContent = 'Результат збережено у вашому профілі.';
    } catch (e) {
      saved.textContent = 'Не вдалося зберегти: ' + e.message;
    }
    renderHistory(box.querySelector('#history'));
  }

  box.addEventListener('click', e => {
    const ans = e.target.closest('.answer');
    if (ans) { state.answers[state.i] = Number(ans.dataset.k); show(); box.querySelector('#next').focus(); return; }
    if (e.target.id === 'prev') { state.i--; show(); }
    if (e.target.id === 'next') { state.i === QUESTIONS.length - 1 ? finish() : (state.i++, show()); }
    if (e.target.id === 'again') start();
  });
  start();
}

document.addEventListener('DOMContentLoaded', () => {
  initNav(); initCatalog(); initFaq(); initForm(); initQuiz();
});
