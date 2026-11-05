# Контракт API: сайт M&D ↔ MDs connect

Сайт очікує від MDs connect 6 методів. Якщо в MDs connect вже є API з іншими
назвами/полями — адаптуємо `js/api.js` (realApi) або `server/proxy.js`, сам сайт не змінюється.

## Схема

```
Браузер ──► /api/*  (наш server/proxy.js, тут лежить токен)  ──►  MDs connect API
```

Токен **ніколи** не передається в браузер. Проксі пропускає лише перелічені нижче
маршрути і обмежує кількість записів з однієї IP (антиспам).

Авторизація до MDs connect: заголовок `Authorization: Bearer <MDS_CONNECT_TOKEN>`
(налаштовується через `MDS_CONNECT_AUTH_HEADER` / `MDS_CONNECT_AUTH_PREFIX`).

Дати — `YYYY-MM-DD`, час — `HH:mm`, часовий пояс салону — `Europe/Kyiv`.

---

### `GET /categories`
```json
[{ "id": "women", "name": "Жіночі стрижки" }]
```

### `GET /services`
```json
[{ "id": "s1", "categoryId": "women", "name": "Жіноча стрижка",
   "duration": 60, "priceFrom": 400, "popular": true }]
```
`duration` — хвилини. `popular: true` — показується в блоці «Популярні послуги».

### `GET /masters?serviceId=s1`
Майстри, які виконують послугу.
```json
[{ "id": "m1", "name": "Марина", "role": "Топ-стиліст", "photo": "https://…/m1.jpg" }]
```

### `GET /availability/days?serviceId=s1&masterId=m1&from=2026-11-05&to=2026-11-30`
Кількість вільних віконець по днях (для календаря). `masterId` може бути відсутній =
«будь-який майстер».
```json
[{ "date": "2026-11-05", "freeSlots": 7 }, { "date": "2026-11-06", "freeSlots": 0 }]
```

### `GET /availability/slots?serviceId=s1&masterId=m1&date=2026-11-05`
Усі слоти дня з урахуванням тривалості послуги — і вільні, і зайняті
(зайняті сайт показує сірими).
```json
[{ "time": "09:00", "available": false, "masterId": null },
 { "time": "09:30", "available": true,  "masterId": "m1" }]
```
Якщо `masterId` не передано, MDs connect сам підбирає вільного майстра і повертає його в `masterId`.

### `POST /bookings`
```json
{
  "salonId": "md-kyiv-1",
  "serviceId": "s1",
  "masterId": "m1",
  "date": "2026-11-05",
  "time": "09:30",
  "client": { "name": "Олена", "phone": "+380971234567", "comment": "" },
  "source": "website"
}
```
Відповідь `201`:
```json
{ "id": "bk_123", "status": "confirmed" }
```
`status`: `confirmed` | `pending` (якщо адміністратор має підтвердити вручну).

Помилки — `4xx/5xx` з тілом `{ "code": "...", "message": "текст для клієнта" }`.
Обов'язково: якщо слот вже зайнятий — `409` з `"code": "SLOT_TAKEN"`;
сайт тоді сам оновить розклад і попросить обрати інший час.

---

## Що потрібно від MDs connect

1. Базовий URL API та токен (API-ключ) з правами: читати послуги/майстрів/розклад, створювати записи.
2. Підтвердження, що є методи вище (або документація до наявних — підлаштуємо).
3. Бажано: вебхук або коротке кешування — не обов'язково, сайт запитує розклад наживо.
