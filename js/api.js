/**
 * MdsApi — єдина точка спілкування сайту з MDs connect.
 * Решта коду викликає лише ці методи і не знає, звідки дані (mock чи реальний API).
 * Контракт описано в docs/API.md.
 */
(function () {
  const cfg = window.MD_CONFIG;

  /* ---------------- REAL API (через проксі) ---------------- */
  async function request(path, options = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.requestTimeoutMs);
    try {
      const res = await fetch(cfg.apiBase + path, {
        ...options,
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(options.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.message || `Помилка сервера (${res.status})`);
        err.status = res.status;
        err.code = data.code;
        throw err;
      }
      return data;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("Сервер не відповідає. Спробуйте ще раз.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "")).toString();

  const realApi = {
    getCategories: () => request("/categories"),
    getServices: () => request("/services"),
    getMasters: (serviceId) => request("/masters" + (serviceId ? "?" + qs({ serviceId }) : "")),
    getDays: (p) => request("/availability/days?" + qs(p)),
    getSlots: (p) => request("/availability/slots?" + qs(p)),
    createBooking: (body) => request("/bookings", { method: "POST", body: JSON.stringify(body) }),
  };

  /* ---------------- MOCK API (демо) ---------------- */
  const CATEGORIES = [
    { id: "women", name: "Жіночі стрижки" },
    { id: "men", name: "Чоловічі стрижки" },
    { id: "color", name: "Фарбування" },
    { id: "styling", name: "Укладання" },
    { id: "care", name: "Догляд" },
    { id: "nails", name: "Манікюр" },
  ];
  // prices — варіанти ціни (напр. за довжиною волосся). priceFrom = мінімальна.
  const HAIR = (a, b, c) => [{ id: "short", label: "Коротке", price: a }, { id: "medium", label: "Середнє", price: b }, { id: "long", label: "Довге", price: c }];
  const SERVICES = [
    { id: "s1", categoryId: "women", name: "Жіноча стрижка", duration: 60, priceFrom: 400, prices: HAIR(400, 500, 600), popular: true },
    { id: "s2", categoryId: "women", name: "Стрижка кінчиків", duration: 30, priceFrom: 300 },
    { id: "s3", categoryId: "men", name: "Чоловіча стрижка", duration: 45, priceFrom: 450, popular: true },
    { id: "s4", categoryId: "men", name: "Стрижка + борода", duration: 60, priceFrom: 650 },
    { id: "s5", categoryId: "color", name: "Фарбування в один тон", duration: 120, priceFrom: 800, prices: HAIR(800, 1100, 1400), popular: true },
    { id: "s6", categoryId: "color", name: "Airtouch / балаяж", duration: 240, priceFrom: 2500, prices: HAIR(2500, 3200, 4000) },
    { id: "s7", categoryId: "styling", name: "Укладання", duration: 60, priceFrom: 600, prices: HAIR(600, 750, 900), popular: true },
    { id: "s8", categoryId: "styling", name: "Вечірня зачіска", duration: 90, priceFrom: 1200 },
    { id: "s9", categoryId: "care", name: "Відновлення волосся", duration: 60, priceFrom: 900, prices: HAIR(900, 1100, 1300) },
    { id: "s10", categoryId: "nails", name: "Манікюр", duration: 60, priceFrom: 500, popular: true },
    { id: "s11", categoryId: "nails", name: "Манікюр + покриття", duration: 90, priceFrom: 750 },
  ];
  const byCat = (...cats) => SERVICES.filter((s) => cats.includes(s.categoryId)).map((s) => s.id);
  const MASTERS = [
    { id: "m1", name: "Марина", role: "Топ-стиліст", about: "12 років досвіду. Складні стрижки та вечірні образи.", photo: null, serviceIds: byCat("women", "styling", "care") },
    { id: "m2", name: "Дмитро", role: "Барбер", about: "Класичні та сучасні чоловічі стрижки, оформлення бороди.", photo: null, serviceIds: byCat("men") },
    { id: "m3", name: "Ольга", role: "Колорист", about: "Airtouch, балаяж, складне фарбування і догляд.", photo: null, serviceIds: byCat("color", "care", "women") },
    { id: "m4", name: "Анна", role: "Майстер манікюру", about: "Естетичний манікюр і стійке покриття.", photo: null, serviceIds: byCat("nails") },
  ];
  const STORE_KEY = "md_mock_bookings";
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));
  const loadBookings = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } };
  const saveBookings = (b) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(b)); } catch {} };

  // робочі години: Пн–Сб 9–20, Нд 10–18
  function workHours(dateStr) {
    const dow = new Date(dateStr + "T12:00:00").getDay();
    return dow === 0 ? [10, 18] : [9, 20];
  }
  // детермінований "псевдо-рандом" щоб зайняті слоти не стрибали при перезавантаженні
  function hash(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; }

  function slotsFor(masterId, dateStr, duration) {
    const [from, to] = workHours(dateStr);
    const booked = loadBookings().filter((b) => b.masterId === masterId && b.date === dateStr);
    const now = new Date();
    const res = [];
    for (let m = from * 60; m + duration <= to * 60; m += 30) {
      const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const busyMock = hash(masterId + dateStr + time) < 0.38;
      const busyReal = booked.some((b) => {
        const [h, mm] = b.time.split(":").map(Number);
        const s = h * 60 + mm, e = s + b.duration;
        return m < e && m + duration > s;
      });
      const past = new Date(`${dateStr}T${time}:00`) < now;
      res.push({ time, available: !(busyMock || busyReal || past) });
    }
    return res;
  }

  const mockApi = {
    async getCategories() { await delay(150); return CATEGORIES; },
    async getServices() { await delay(200); return SERVICES; },
    async getMasters(serviceId) {
      await delay();
      return MASTERS.filter((m) => !serviceId || m.serviceIds.includes(serviceId));
    },
    async getDays({ serviceId, masterId, from, to }) {
      await delay();
      const s = SERVICES.find((x) => x.id === serviceId);
      const masters = masterId ? [masterId] : (await mockApi.getMasters(serviceId)).map((m) => m.id);
      const out = [];
      for (let d = new Date(from + "T12:00:00"); d <= new Date(to + "T12:00:00"); d.setDate(d.getDate() + 1)) {
        const date = ymd(d);
        const free = masters.reduce((n, id) => n + slotsFor(id, date, s.duration).filter((x) => x.available).length, 0);
        out.push({ date, freeSlots: free });
      }
      return out;
    },
    async getSlots({ serviceId, masterId, date }) {
      await delay();
      const s = SERVICES.find((x) => x.id === serviceId);
      if (masterId) return slotsFor(masterId, date, s.duration).map((x) => ({ ...x, masterId: x.available ? masterId : null }));
      // "будь-який майстер": слот вільний, якщо вільний хоча б в одного
      const ids = (await mockApi.getMasters(serviceId)).map((m) => m.id);
      const per = ids.map((id) => slotsFor(id, date, s.duration));
      return per[0].map((slot, i) => {
        const idx = per.findIndex((list) => list[i].available);
        return { time: slot.time, available: idx >= 0, masterId: idx >= 0 ? ids[idx] : null };
      });
    },
    async createBooking(body) {
      await delay(600);
      const s = SERVICES.find((x) => x.id === body.serviceId);
      const slot = slotsFor(body.masterId, body.date, s.duration).find((x) => x.time === body.time);
      if (!slot || !slot.available) {
        const e = new Error("На жаль, цей час щойно зайняли. Оберіть інший."); e.code = "SLOT_TAKEN"; e.status = 409; throw e;
      }
      const booking = { id: "bk_" + Date.now().toString(36), status: "confirmed", duration: s.duration, ...body };
      saveBookings([...loadBookings(), booking]);
      return { id: booking.id, status: booking.status };
    },
  };

  window.MdsApi = cfg.mode === "api" ? realApi : mockApi;
  window.MdsApi.mode = cfg.mode;
})();
