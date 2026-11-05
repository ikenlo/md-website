/**
 * Онлайн-запис: Послуга → Майстер → Дата і час → Контакти.
 * Усі дані беруться через window.MdsApi (mock або MDs connect).
 */
(function () {
  const api = window.MdsApi;
  const cfg = window.MD_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, html = "") => Object.assign(document.createElement(tag), attrs, html ? { innerHTML: html } : {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const money = (n) => `від ${Number(n).toLocaleString("uk-UA")} грн`;
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} год${m % 60 ? " " + (m % 60) + " хв" : ""}` : `${m} хв`);
  const fmtDate = (s) => new Date(s + "T12:00:00").toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  const loader = () => '<div class="loader"><i></i><i></i><i></i></div>';

  const state = {
    step: 1, categories: [], services: [], masters: [],
    categoryId: null, service: null, master: null, // master === null → "будь-який"
    month: null, days: {}, date: null, time: null, slotMasterId: null,
  };

  /* ---------- status badge ---------- */
  const status = $("#apiStatus");
  function setStatus(text, cls = "") { status.textContent = text; status.className = "api-status " + cls; }
  setStatus(api.mode === "api" ? "Онлайн-розклад MDs connect" : "Демо-режим (тестові дані)", api.mode === "api" ? "" : "is-mock");

  /* ---------- steps ---------- */
  function go(step) {
    state.step = step;
    document.querySelectorAll(".step-pane").forEach((p) => p.classList.toggle("is-active", p.dataset.pane == step));
    document.querySelectorAll("#steps li").forEach((li) => {
      const n = +li.dataset.step;
      li.classList.toggle("is-active", n === step);
      li.classList.toggle("is-done", step === "done" || n < step);
    });
    $("#backBtn").hidden = !(step > 1 && step !== "done");
  }
  $("#steps").addEventListener("click", (e) => {
    const li = e.target.closest("li.is-done");
    if (li && state.step !== "done") go(+li.dataset.step);
  });
  $("#backBtn").addEventListener("click", () => go(state.step - 1));
  function scrollToCard() { $("#booking").scrollIntoView({ behavior: "smooth" }); }

  /* ---------- step 1: services ---------- */
  function renderCategories() {
    const box = $("#categoryChips");
    box.innerHTML = "";
    [{ id: null, name: "Усі" }, ...state.categories].forEach((c) => {
      const b = el("button", { className: "chip" + (state.categoryId === c.id ? " is-active" : ""), type: "button", textContent: c.name });
      b.onclick = () => { state.categoryId = c.id; renderCategories(); renderServices(); };
      box.append(b);
    });
  }
  function renderServices() {
    const box = $("#serviceList");
    box.innerHTML = "";
    state.services.filter((s) => !state.categoryId || s.categoryId === state.categoryId).forEach((s) => {
      const b = el("button", { type: "button", className: "option" + (state.service?.id === s.id ? " is-selected" : "") },
        `<div class="option__main"><div class="option__title">${esc(s.name)}</div><div class="option__meta">${dur(s.duration)}</div></div>
         <div class="option__price">${money(s.priceFrom)}</div>`);
      b.onclick = () => selectService(s);
      box.append(b);
    });
  }
  async function selectService(s) {
    state.service = s; state.master = null; state.date = null; state.time = null;
    renderServices();
    go(2);
    const box = $("#masterList");
    box.innerHTML = loader();
    try {
      state.masters = await api.getMasters(s.id);
      renderMasters();
    } catch (e) { box.innerHTML = `<p class="form__error">${esc(e.message)}</p>`; }
  }

  /* ---------- step 2: masters ---------- */
  function renderMasters() {
    const box = $("#masterList");
    box.innerHTML = "";
    const any = el("button", { type: "button", className: "option" },
      `<div class="avatar avatar--any">✦</div><div class="option__main"><div class="option__title">Будь-який майстер</div><div class="option__meta">Найбільше вільного часу</div></div>`);
    any.onclick = () => selectMaster(null);
    box.append(any);
    state.masters.forEach((m) => {
      const b = el("button", { type: "button", className: "option" },
        `<div class="avatar">${m.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(m.name[0])}</div>
         <div class="option__main"><div class="option__title">${esc(m.name)}</div><div class="option__meta">${esc(m.role || "")}</div></div>`);
      b.onclick = () => selectMaster(m);
      box.append(b);
    });
  }
  function selectMaster(m) {
    state.master = m; state.date = null; state.time = null; state.days = {};
    const t = new Date(); state.month = new Date(t.getFullYear(), t.getMonth(), 1);
    go(3);
    renderCalendar();
    $("#slotsTitle").textContent = "Оберіть дату";
    $("#slotsGrid").innerHTML = "";
  }

  /* ---------- step 3: calendar + slots ---------- */
  async function renderCalendar() {
    const box = $("#calendar");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const last = new Date(today); last.setDate(last.getDate() + cfg.daysAhead);
    const y = state.month.getFullYear(), mo = state.month.getMonth();
    const first = new Date(y, mo, 1), end = new Date(y, mo + 1, 0);
    const title = first.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });

    const prevOk = first > today;
    const nextOk = new Date(y, mo + 1, 1) <= last;
    box.innerHTML = `
      <div class="cal__head">
        <button class="cal__btn" type="button" data-nav="-1" ${prevOk ? "" : "disabled"} aria-label="Попередній місяць">‹</button>
        <span class="cal__title">${title}</span>
        <button class="cal__btn" type="button" data-nav="1" ${nextOk ? "" : "disabled"} aria-label="Наступний місяць">›</button>
      </div>
      <div class="cal__grid">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => `<span class="cal__dow">${d}</span>`).join("")}</div>`;
    box.querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => { state.month = new Date(y, mo + +b.dataset.nav, 1); renderCalendar(); }));

    const grid = box.querySelector(".cal__grid");
    for (let i = 0; i < (first.getDay() + 6) % 7; i++) grid.append(el("span"));
    const buttons = [];
    for (let d = 1; d <= end.getDate(); d++) {
      const date = new Date(y, mo, d);
      const key = ymd(date);
      const out = date < today || date > last;
      const b = el("button", { type: "button", className: "cal__day", textContent: d, disabled: true });
      b.dataset.date = key;
      if (+date === +today) b.classList.add("is-today");
      if (key === state.date) b.classList.add("is-selected");
      b.dataset.out = out ? "1" : "";
      b.onclick = () => selectDate(key);
      grid.append(b);
      buttons.push(b);
    }

    // доступність по днях
    const from = ymd(first < today ? today : first);
    const to = ymd(end > last ? last : end);
    if (from > to) return;
    try {
      const days = await api.getDays({ serviceId: state.service.id, masterId: state.master?.id, from, to });
      days.forEach((d) => (state.days[d.date] = d.freeSlots));
    } catch (e) { setStatus(e.message, "is-error"); }
    if (state.month.getMonth() !== mo) return; // користувач вже перегорнув місяць
    buttons.forEach((b) => {
      if (b.dataset.out) return;
      const free = state.days[b.dataset.date];
      b.disabled = !free;
      b.classList.toggle("has-free", free > 0);
      b.classList.toggle("is-full", free === 0);
      if (free != null) b.title = free ? `Вільних віконець: ${free}` : "Немає вільного часу";
    });
  }

  async function selectDate(date) {
    state.date = date; state.time = null;
    document.querySelectorAll(".cal__day").forEach((b) => b.classList.toggle("is-selected", b.dataset.date === date));
    $("#slotsTitle").textContent = fmtDate(date);
    const box = $("#slotsGrid");
    box.innerHTML = loader();
    try {
      const slots = await api.getSlots({ serviceId: state.service.id, masterId: state.master?.id, date });
      if (state.date !== date) return;
      box.innerHTML = "";
      if (!slots.length) box.innerHTML = '<p class="slots__empty">У цей день немає вільного часу</p>';
      slots.forEach((s) => {
        const b = el("button", { type: "button", className: "slot", textContent: s.time, disabled: !s.available });
        if (!s.available) b.title = "Зайнято";
        b.onclick = () => { state.time = s.time; state.slotMasterId = s.masterId || state.master?.id; toConfirm(); };
        box.append(b);
      });
    } catch (e) { box.innerHTML = `<p class="slots__empty form__error">${esc(e.message)}</p>`; }
  }

  /* ---------- step 4: confirm ---------- */
  function toConfirm() {
    const m = state.master || state.masters.find((x) => x.id === state.slotMasterId);
    $("#summary").innerHTML = `
      <h4>Ваш запис</h4>
      <dl>
        <dt>Послуга</dt><dd>${esc(state.service.name)}</dd>
        <dt>Майстер</dt><dd>${esc(m ? m.name : "Будь-який")}</dd>
        <dt>Дата</dt><dd>${fmtDate(state.date)}</dd>
        <dt>Час</dt><dd>${state.time} · ${dur(state.service.duration)}</dd>
        <dt class="total">Вартість</dt><dd class="total">${money(state.service.priceFrom)}</dd>
      </dl>`;
    $("#formError").textContent = "";
    go(4);
  }

  const form = $("#bookingForm");
  const phoneOk = (v) => v.replace(/\D/g, "").length >= 10;
  form.phone.addEventListener("input", () => form.phone.classList.remove("is-invalid"));
  form.name.addEventListener("input", () => form.name.classList.remove("is-invalid"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#formError");
    const name = form.name.value.trim(), phone = form.phone.value.trim();
    form.name.classList.toggle("is-invalid", !name);
    form.phone.classList.toggle("is-invalid", !phoneOk(phone));
    if (!name || !phoneOk(phone)) return (err.textContent = "Вкажіть ім'я та коректний номер телефону");
    if (!form.agree.checked) return (err.textContent = "Потрібна згода на обробку даних");

    const btn = $("#submitBtn");
    btn.disabled = true; btn.textContent = "Записуємо…"; err.textContent = "";
    try {
      const res = await api.createBooking({
        salonId: cfg.salonId,
        serviceId: state.service.id,
        masterId: state.slotMasterId,
        date: state.date,
        time: state.time,
        client: { name, phone, comment: form.comment.value.trim() },
        source: "website",
      });
      const m = state.masters.find((x) => x.id === state.slotMasterId);
      $("#successText").innerHTML = `${esc(state.service.name)}${m ? ", майстер " + esc(m.name) : ""}<br><b>${fmtDate(state.date)}, ${state.time}</b><br>Номер запису: ${esc(res.id)}. Ми зателефонуємо для підтвердження.`;
      form.reset();
      go("done");
    } catch (ex) {
      err.textContent = ex.message;
      if (ex.code === "SLOT_TAKEN" || ex.status === 409) { go(3); selectDate(state.date); renderCalendar(); }
    } finally {
      btn.disabled = false; btn.textContent = "Підтвердити запис";
    }
  });

  $("#restartBtn").addEventListener("click", () => {
    Object.assign(state, { service: null, master: null, date: null, time: null });
    renderServices(); go(1);
  });

  /* ---------- prices block ---------- */
  function renderPrices() {
    const cards = $("#priceCards");
    cards.innerHTML = "";
    state.services.filter((s) => s.popular).slice(0, 5).forEach((s) => {
      const c = el("button", { type: "button", className: "price-card" },
        `<div class="price-card__name">${esc(s.name)}</div><div class="price-card__price">від <b>${s.priceFrom}</b> грн</div>`);
      c.onclick = () => { selectService(s); scrollToCard(); };
      cards.append(c);
    });
    const full = $("#priceFull");
    full.innerHTML = state.categories.map((c) => {
      const rows = state.services.filter((s) => s.categoryId === c.id)
        .map((s) => `<div class="price-row"><span>${esc(s.name)}</span><span>${money(s.priceFrom)}</span></div>`).join("");
      return rows ? `<h4>${esc(c.name)}</h4>${rows}` : "";
    }).join("");
  }
  $("#fullPriceBtn").addEventListener("click", (e) => {
    const full = $("#priceFull");
    full.hidden = !full.hidden;
    e.currentTarget.firstChild.textContent = full.hidden ? "Повний прайс " : "Згорнути ";
  });

  /* ---------- feature icons → category ---------- */
  document.querySelectorAll(".features a[data-category]").forEach((a) =>
    a.addEventListener("click", () => {
      state.categoryId = a.dataset.category;
      renderCategories(); renderServices(); go(1);
    })
  );

  /* ---------- init ---------- */
  (async function init() {
    $("#serviceList").innerHTML = loader();
    try {
      [state.categories, state.services] = await Promise.all([api.getCategories(), api.getServices()]);
      renderCategories(); renderServices(); renderPrices();
    } catch (e) {
      setStatus("Немає зв'язку з розкладом", "is-error");
      $("#serviceList").innerHTML = `<p class="slots__empty">Не вдалося завантажити послуги. Зателефонуйте нам: <a class="gold" href="tel:+380971234567">+38 (097) 123 45 67</a></p>`;
    }
  })();
})();
