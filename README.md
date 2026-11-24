# CyberLearn — лабораторна робота № 5

Вебзастосунок з онлайн-курсами з кібербезпеки: клієнт (HTML, CSS, JS) + сервер Node.js/Express + база SQLite.

## Можливості
- Каталог курсів із сервера, пошук (без урахування регістру, кирилицею) і фільтр за рівнем.
- Повний CRUD курсів для адміністратора (заголовок `x-admin-key`).
- Реєстрація та вхід з перевіркою на клієнті й сервері; паролі — bcrypt-хеші, сесія — JWT (2 год).
- Тест з кібербезпеки: результат зберігається в базі, показується історія останніх 10 спроб.

## Запуск локально
```bash
npm install
cp .env.example .env   # заповніть JWT_SECRET і ADMIN_KEY
npm start              # http://localhost:3000
npm test               # автоматичні тести REST API
```

## REST API
| Метод | Маршрут | Дія |
|---|---|---|
| GET | /api/courses?q=&level= | Список курсів |
| GET | /api/courses/:id | Один курс |
| POST | /api/courses | Створити курс (ключ адміна) |
| PUT | /api/courses/:id | Оновити курс (ключ адміна) |
| DELETE | /api/courses/:id | Видалити курс (ключ адміна) |
| POST | /api/auth/register | Реєстрація |
| POST | /api/auth/login | Вхід, повертає токен |
| POST | /api/results | Зберегти результат тесту (токен) |
| GET | /api/results/me | Мої результати (токен) |

Приклад створення курсу:
```bash
curl -X POST http://localhost:3000/api/courses \
  -H "Content-Type: application/json" -H "x-admin-key: ВАШ_КЛЮЧ" \
  -d '{"title":"Безпека смартфона","level":"beginner","lessons":5,"duration":"1 год"}'
```

## Розгортання на Render
New → Blueprint → вибрати цей репозиторій (налаштування беруться з `render.yaml`, секрети генеруються автоматично).
На безкоштовному тарифі файл SQLite скидається після перезапуску; для постійного зберігання — Render Disk або PostgreSQL.

## Безпека
Параметризовані SQL-запити, bcrypt, JWT, helmet (CSP та інші заголовки), rate limit на `/api/auth`, `trust proxy` для хмари,
екранування HTML на клієнті, перевірка даних на сервері, секрети лише у змінних середовища (`.env` у `.gitignore`).
