/**
 * Налаштування інтеграції з MDs connect.
 *
 * mode:
 *   "mock"  — демо-режим: послуги, майстри та розклад генеруються в браузері,
 *             записи зберігаються в localStorage. Для розробки дизайну.
 *   "api"   — реальні дані. Сайт звертається до apiBase (наш проксі /api),
 *             а проксі вже з секретним токеном ходить у MDs connect.
 *
 * ВАЖЛИВО: токен MDs connect НІКОЛИ не пишемо сюди — цей файл бачить кожен відвідувач.
 * Токен живе лише на сервері (див. server/proxy.js та .env.example).
 */
window.MD_CONFIG = {
  mode: "mock",
  apiBase: "/api",
  salonId: "md-kyiv-1",
  timezone: "Europe/Kyiv",
  daysAhead: 30,          // на скільки днів вперед показувати календар
  requestTimeoutMs: 10000,
};
